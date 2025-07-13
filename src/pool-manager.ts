import { Address, BigInt, Bytes, store, log, BigDecimal } from "@graphprotocol/graph-ts";

// Import price calculation utilities and liquidity math from official Uniswap V4 approach
import { 
  sqrtPriceX96ToTokenPrices,
  adjustForDecimals,
  getAmount0,
  getAmount1 
} from "./tick-math";

// Import centralized constants
import {
  HARDCODED_HOOK_ID_STRING,
  HARDCODED_HOOK_ID_BYTES,
  aUSDC_ADDRESS,
  aUSDT_ADDRESS,
  aETH_ADDRESS,
  aBTC_ADDRESS,
  ETH_ADDRESS,
  aUSDC_USD_PRICE,
  aUSDT_USD_PRICE,
  aUSDC_aUSDT_POOL_ID,
  aUSDT_aETH_POOL_ID,
  aBTC_aETH_POOL_ID,
  aUSDC_aBTC_POOL_ID,
  ETH_aUSDT_POOL_ID,
  STATEVIEW_CONTRACT_ADDRESS
} from "./constants";

// Import event types from the contract ABI
import {
  Initialize as InitializeEvent,
  ModifyLiquidity as ModifyLiquidityEvent,
  Swap as SwapEvent,
  PoolManager as PoolManagerContract // Import the contract itself to call functions
} from "../generated/PoolManager/PoolManager";

import { FeeUpdated as FeeUpdatedEvent } from "../generated/AlphixHook/AlphixHook"; // Import for the new hook event

// Import entity types from the schema
import { HookPosition, TrackedPool, Token, Swap, PoolDayData, FeeUpdate } from "../generated/schema";

// Import contract types generated from ABIs
import { ERC20 } from "../generated/PoolManager/ERC20"; // ERC20 ABI
import { StateView } from "../generated/PoolManager/StateView"; // Import StateView contract type

// Helper function to convert token amounts to decimal with proper scaling
function convertTokenToDecimal(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
  if (exchangeDecimals == BigInt.fromI32(0)) {
    return tokenAmount.toBigDecimal();
  }
  return tokenAmount.toBigDecimal().div(BigInt.fromI32(10).pow(exchangeDecimals.toI32() as u8).toBigDecimal());
}

// All constants are now imported from ./constants.ts

// Helper function to fetch token details
function fetchTokenDetails(tokenAddress: Address): Token {
  let token = Token.load(tokenAddress); 
  if (token == null) {
    token = new Token(tokenAddress);
    
    // Handle native ETH (zero address) as a special case
    if (tokenAddress.toHexString() == ETH_ADDRESS.toHexString()) {
      token.symbol = "ETH";
      token.decimals = BigInt.fromI32(18);
      log.info("Detected native ETH token", []);
    } else {
      // Handle ERC20 tokens
      let contract = ERC20.bind(tokenAddress);
      let symbolCall = contract.try_symbol();
      if (symbolCall.reverted) {
        log.warning("symbol() call reverted for token {}", [tokenAddress.toHexString()]);
        token.symbol = "N/A";
      } else {
        token.symbol = symbolCall.value;
      }
      let decimalsCall = contract.try_decimals();
      if (decimalsCall.reverted) {
        log.warning("decimals() call reverted for token {}", [tokenAddress.toHexString()]);
        token.decimals = BigInt.fromI32(0);
      } else {
        token.decimals = BigInt.fromI32(decimalsCall.value);
      }
    }
    token.save();
  }
  return token;
}

function getOrCreatePoolDayData(poolId: Bytes, timestamp: BigInt): PoolDayData {
  let dayID = timestamp.toI32() / 86400; 
  let dayStartTimestamp = dayID * 86400;
  let poolDayDataID = poolId.toHexString() + '-' + BigInt.fromI32(dayID).toString();
  let poolDayData = PoolDayData.load(poolDayDataID);

  if (poolDayData === null) {
    poolDayData = new PoolDayData(poolDayDataID);
    poolDayData.date = dayStartTimestamp;
    poolDayData.pool = poolId;
    
    // Initialize volume tracking (with/without fees)
    poolDayData.volumeWFeeToken0 = BigDecimal.zero();
    poolDayData.volumeWFeeToken1 = BigDecimal.zero();
    poolDayData.volumeToken0 = BigDecimal.zero();
    poolDayData.volumeToken1 = BigDecimal.zero();
    
    // Initialize raw token TVL (no USD conversion)
    poolDayData.tvlToken0 = BigDecimal.zero();
    poolDayData.tvlToken1 = BigDecimal.zero();
    
    poolDayData.currentFeeRateBps = BigInt.zero(); // Initialize fee rate

    // Attempt to load the corresponding TrackedPool to get the initial/current fee and TVL
    let trackedPool = TrackedPool.load(poolId);
    if (trackedPool != null) {
        poolDayData.currentFeeRateBps = trackedPool.currentFeeRateBps; // Set from pool if available
        poolDayData.tvlToken0 = trackedPool.tvlToken0;
        poolDayData.tvlToken1 = trackedPool.tvlToken1;
    }
    poolDayData.save();
  }
  return poolDayData;
}

// DEPRECATED: This function is fundamentally broken for Uniswap V4 TVL calculation
// V4's singleton PoolManager holds tokens for ALL pools, so balanceOf() returns 
// aggregate balances across all pools, not pool-specific balances.
// This function is kept for reference but should not be used for TVL calculation.
function getTokenBalance(tokenAddress: Address, accountAddress: Address): BigInt {
    log.warning("getTokenBalance() called - this function returns aggregate balances for ALL pools in V4, not pool-specific balances", []);
    
    // Handle native ETH (zero address) as a special case
    if (tokenAddress.toHexString() == ETH_ADDRESS.toHexString()) {
        log.warning("ETH balance requested - V4 PoolManager holds ETH for all pools, not pool-specific", []);
        return BigInt.fromI32(0);
    } else {
        // Handle ERC20 tokens
        let contract = ERC20.bind(tokenAddress);
        let balanceCall = contract.try_balanceOf(accountAddress);
        if (balanceCall.reverted) {
            log.warning("balanceOf() call reverted for token {} and account {}", [tokenAddress.toHexString(), accountAddress.toHexString()]);
            return BigInt.fromI32(0);
        }
        log.warning("Returning aggregate balance {} for token {} - this includes ALL pools, not just one pool", [
            balanceCall.value.toString(), 
            tokenAddress.toHexString()
        ]);
        return balanceCall.value;
    }
}

// Helper function to get USD price for any supported token
function getTokenPriceUSD(tokenAddress: Bytes): BigDecimal {
    // USD stable tokens are always $1.00
    if (tokenAddress.equals(aUSDC_ADDRESS) || tokenAddress.equals(aUSDT_ADDRESS)) {
        return BigDecimal.fromString("1.0");
    }
    
    // For other tokens, derive price from relevant pools
    let stateViewContract = StateView.bind(STATEVIEW_CONTRACT_ADDRESS);
    
    if (tokenAddress.equals(aETH_ADDRESS)) {
        // Derive aETH price from aUSDT/aETH pool
        let getSlot0Call = stateViewContract.try_getSlot0(aUSDT_aETH_POOL_ID);
        if (!getSlot0Call.reverted) {
            return deriveTokenPriceFromUsdPool(getSlot0Call.value.value0.toBigDecimal(), aUSDT_aETH_POOL_ID, aETH_ADDRESS, aUSDT_ADDRESS);
        }
    } else if (tokenAddress.equals(ETH_ADDRESS)) {
                // Derive ETH price from ETH/aUSDT pool
        let getSlot0Call = stateViewContract.try_getSlot0(ETH_aUSDT_POOL_ID);
        if (!getSlot0Call.reverted) {
            return deriveTokenPriceFromUsdPool(getSlot0Call.value.value0.toBigDecimal(), ETH_aUSDT_POOL_ID, ETH_ADDRESS, aUSDT_ADDRESS);
        }
    }
    // For aBTC, we'll handle it in a separate function since we need to find the pool dynamically
    
    log.warning("Unable to derive USD price for token: {}", [tokenAddress.toHexString()]);
    return BigDecimal.zero();
}

// Helper function to derive token price from a USD pool
function deriveTokenPriceFromUsdPool(sqrtPriceX96: BigDecimal, poolId: Bytes, targetToken: Bytes, usdToken: Bytes): BigDecimal {
    let trackedPool = TrackedPool.load(poolId);
    if (trackedPool == null) {
        log.warning("Pool not tracked for price derivation: {}", [poolId.toHexString()]);
        return BigDecimal.zero();
    }
    
    let token0 = Token.load(trackedPool.currency0)!;
    let token1 = Token.load(trackedPool.currency1)!;
    
    let Q96 = BigDecimal.fromString("79228162514264337593543950336");
    let priceOfToken1InToken0 = (sqrtPriceX96.div(Q96)).times(sqrtPriceX96.div(Q96));
    
    // Adjust for decimal differences
    let token0DecimalFactor = BigInt.fromI32(10).pow(token0.decimals.toI32() as u8).toBigDecimal();
    let token1DecimalFactor = BigInt.fromI32(10).pow(token1.decimals.toI32() as u8).toBigDecimal();
    let priceAdjustmentFactor = token0DecimalFactor.div(token1DecimalFactor);
    let adjustedPriceOfToken1InToken0 = priceOfToken1InToken0.times(priceAdjustmentFactor);
    
    // Determine which token is the target and which is USD
    if (token0.id.equals(targetToken) && token1.id.equals(usdToken)) {
        // target is token0, USD is token1: price = 1/adjustedPrice * $1.00
        return BigDecimal.fromString("1.0").div(adjustedPriceOfToken1InToken0);
    } else if (token0.id.equals(usdToken) && token1.id.equals(targetToken)) {
        // USD is token0, target is token1: price = adjustedPrice * $1.00
        return adjustedPriceOfToken1InToken0.times(BigDecimal.fromString("1.0"));
    }
    
    log.warning("Token pair mismatch in price derivation for pool: {}", [poolId.toHexString()]);
    return BigDecimal.zero();
}

// Context-aware helper to get USD price for tokens, using current pool if it contains reference tokens
function getTokenPriceUSDWithContext(tokenAddress: Bytes, contextPoolId: Bytes): BigDecimal {
    // USD stable tokens are always $1.00
    if (tokenAddress.equals(aUSDC_ADDRESS) || tokenAddress.equals(aUSDT_ADDRESS)) {
        return BigDecimal.fromString("1.0");
    }
    
    // Check if we can derive price from the current pool context
    let contextPool = TrackedPool.load(contextPoolId);
    if (contextPool != null) {
        let token0 = Token.load(contextPool.currency0)!;
        let token1 = Token.load(contextPool.currency1)!;
        
        // If current pool contains the target token + a USD token, derive price from it
        if ((token0.id.equals(tokenAddress) && (token1.id.equals(aUSDC_ADDRESS) || token1.id.equals(aUSDT_ADDRESS))) ||
            (token1.id.equals(tokenAddress) && (token0.id.equals(aUSDC_ADDRESS) || token0.id.equals(aUSDT_ADDRESS)))) {
            
            let stateViewContract = StateView.bind(STATEVIEW_CONTRACT_ADDRESS);
            let getSlot0Call = stateViewContract.try_getSlot0(contextPoolId);
            if (!getSlot0Call.reverted) {
                return deriveTokenPriceFromPool(getSlot0Call.value.value0.toBigDecimal(), contextPoolId, tokenAddress);
            }
        }
    }
    
    // Fall back to the general pricing function
    return getTokenPriceUSD(tokenAddress);
}

// Helper function to derive a specific token's USD price from any pool containing it + a USD token
function deriveTokenPriceFromPool(sqrtPriceX96: BigDecimal, poolId: Bytes, targetTokenAddress: Bytes): BigDecimal {
    let trackedPool = TrackedPool.load(poolId);
    if (trackedPool == null) {
        return BigDecimal.zero();
    }
    
    let token0 = Token.load(trackedPool.currency0)!;
    let token1 = Token.load(trackedPool.currency1)!;
    
    let Q96 = BigDecimal.fromString("79228162514264337593543950336");
    let priceOfToken1InToken0 = (sqrtPriceX96.div(Q96)).times(sqrtPriceX96.div(Q96));
    
    let token0DecimalFactor = BigInt.fromI32(10).pow(token0.decimals.toI32() as u8).toBigDecimal();
    let token1DecimalFactor = BigInt.fromI32(10).pow(token1.decimals.toI32() as u8).toBigDecimal();
    let priceAdjustmentFactor = token0DecimalFactor.div(token1DecimalFactor);
    let adjustedPriceOfToken1InToken0 = priceOfToken1InToken0.times(priceAdjustmentFactor);
    
    // Determine which token is our target and which is USD
    if (token0.id.equals(targetTokenAddress) && (token1.id.equals(aUSDC_ADDRESS) || token1.id.equals(aUSDT_ADDRESS))) {
        // Target token is token0, USD token is token1
        // Price of target = 1 / (price of token1 in token0) = 1 / adjustedPrice
        return BigDecimal.fromString("1.0").div(adjustedPriceOfToken1InToken0);
    } else if (token1.id.equals(targetTokenAddress) && (token0.id.equals(aUSDC_ADDRESS) || token0.id.equals(aUSDT_ADDRESS))) {
        // Target token is token1, USD token is token0
        // Price of target = price of token1 in token0 = adjustedPrice
        return adjustedPriceOfToken1InToken0;
    }
    
    log.warning("Unable to derive price for token {} from pool {}", [targetTokenAddress.toHexString(), poolId.toHexString()]);
    return BigDecimal.zero();
}

function calculateTvlUSD(poolId: Bytes, poolAddress: Address, blockTimestamp: BigInt): BigDecimal {
    let trackedPool = TrackedPool.load(poolId);
    if (trackedPool == null) {
        log.error("Cannot calculate TVL for untracked pool: {}", [poolId.toHexString()]);
        return BigDecimal.zero();
    }

    // TODO: Implement proper V4 TVL calculation using event-based liquidity tracking
    // The current getTokenBalance() approach is fundamentally broken for V4 because:
    // 1. V4 uses a singleton PoolManager that holds tokens for ALL pools
    // 2. getTokenBalance() returns aggregate balances across all pools, not pool-specific balances
    // 3. This results in massively inflated TVL values
    // 
    // Proper solution requires:
    // 1. Track ModifyLiquidity events to maintain pool-specific liquidity
    // 2. Use V4 tick math to convert liquidity deltas to token amounts
    // 3. Aggregate position data for accurate pool TVL
    //
    // For now, return zero to avoid misleading data
    
    log.info("TVL Calc: Pool {} - TVL calculation temporarily disabled (V4 singleton architecture requires event-based tracking)", [
        poolId.toHexString()
    ]);
    
    return BigDecimal.zero();
}

export function handleInitialize(event: InitializeEvent): void {
  if (event.params.hooks.equals(HARDCODED_HOOK_ID_BYTES)) {
    let pool = new TrackedPool(event.params.id);
    let token0 = fetchTokenDetails(event.params.currency0);
    let token1 = fetchTokenDetails(event.params.currency1);
    
    pool.currency0 = token0.id; 
    pool.currency1 = token1.id; 
    
    // Initialize event-based TVL tracking
    pool.tvlToken0 = BigDecimal.zero();
    pool.tvlToken1 = BigDecimal.zero();
    pool.totalValueLockedToken0 = BigDecimal.zero();
    pool.totalValueLockedToken1 = BigDecimal.zero();
    
    // Initialize pool state
    pool.sqrtPriceX96 = event.params.sqrtPriceX96;
    pool.tick = event.params.tick;
    pool.liquidity = BigInt.zero(); // No liquidity at initialization
    
    // Initialize transaction count
    pool.txCount = BigInt.zero();
    
    // The AlphixV0 hook's _afterInitialize sets the fee and emits FeeUpdated.
    // So, currentFeeRateBps will be set by handleFeeUpdated for new pools.
    // We initialize it here to avoid null issues if handleFeeUpdated hasn't run yet for some reason,
    // or if the event is processed out of order (though unlikely for init).
    pool.currentFeeRateBps = BigInt.fromI32(event.params.fee); // Use fee from PoolManager's Initialize event as initial default
    
    pool.save();
    
    log.info("Initialized tracked pool {} with tokens {} and {}", [
      event.params.id.toHexString(),
      token0.symbol,
      token1.symbol
    ]);
  }
}

export function handleModifyLiquidity(event: ModifyLiquidityEvent): void {
  let poolIdBytes = event.params.id;
  let trackedPool = TrackedPool.load(poolIdBytes);

  if (trackedPool != null) {
    let eoaOwnerAddress = event.transaction.from;
    let tickLower = event.params.tickLower;
    let tickUpper = event.params.tickUpper;
    let salt = event.params.salt;
    let positionIdString = poolIdBytes.toHexString() + "-" + eoaOwnerAddress.toHexString() + "-" + tickLower.toString() + "-" + tickUpper.toString() + "-" + salt.toHexString();
    let position = HookPosition.load(positionIdString);

    if (position == null) {
      position = new HookPosition(positionIdString);
      position.pool = poolIdBytes;
      position.owner = eoaOwnerAddress;
      position.hook = HARDCODED_HOOK_ID_BYTES;
      position.currency0 = trackedPool.currency0;
      position.currency1 = trackedPool.currency1;
      position.tickLower = tickLower;
      position.tickUpper = tickUpper;
      position.salt = salt;
      position.liquidity = event.params.liquidityDelta;
    } else {
      position.liquidity = position.liquidity.plus(event.params.liquidityDelta);
    }

    position.blockNumber = event.block.number;
    position.blockTimestamp = event.block.timestamp;
    position.transactionHash = event.transaction.hash;

    if (position.liquidity.le(BigInt.fromI32(0))) {
      store.remove("HookPosition", positionIdString);
    } else {
      position.save();
    }

    // Get token details for decimal conversion
    let token0 = Token.load(trackedPool.currency0)!;
    let token1 = Token.load(trackedPool.currency1)!;
    
    // Calculate token amounts using official Uniswap V4 approach with tick ranges
    let currTick: i32 = trackedPool.tick;
    let currSqrtPriceX96 = trackedPool.sqrtPriceX96;

    // Get the raw amounts using the official getAmount0/getAmount1 functions
    let amount0Raw = getAmount0(
      event.params.tickLower,
      event.params.tickUpper,
      currTick,
      event.params.liquidityDelta,
      currSqrtPriceX96,
    );
    let amount1Raw = getAmount1(
      event.params.tickLower,
      event.params.tickUpper,
      currTick,
      event.params.liquidityDelta,
      currSqrtPriceX96,
    );

    // Convert to human-readable amounts with proper decimal scaling
    let amount0 = convertTokenToDecimal(amount0Raw, token0.decimals);
    let amount1 = convertTokenToDecimal(amount1Raw, token1.decimals);

    // Update pool transaction count
    trackedPool.txCount = trackedPool.txCount.plus(BigInt.fromI32(1));

    // Update pool liquidity from the event  
    trackedPool.liquidity = trackedPool.liquidity.plus(event.params.liquidityDelta);
    
    // Update TVL using properly calculated token amounts
    trackedPool.totalValueLockedToken0 = trackedPool.totalValueLockedToken0.plus(amount0);
    trackedPool.totalValueLockedToken1 = trackedPool.totalValueLockedToken1.plus(amount1);
    
    // Also update deprecated TVL fields for backward compatibility
    trackedPool.tvlToken0 = trackedPool.totalValueLockedToken0;
    trackedPool.tvlToken1 = trackedPool.totalValueLockedToken1;
    
    log.info("Updated pool {} TVL: {} {} / {} {} (amounts: {}/{}, liquidity delta: {})", [
      poolIdBytes.toHexString(),
      trackedPool.totalValueLockedToken0.toString(), token0.symbol,
      trackedPool.totalValueLockedToken1.toString(), token1.symbol,
      amount0.toString(), amount1.toString(),
      event.params.liquidityDelta.toString()
    ]);
    
    trackedPool.save();

    let poolDayData = getOrCreatePoolDayData(poolIdBytes, event.block.timestamp);
    poolDayData.tvlToken0 = trackedPool.tvlToken0;
    poolDayData.tvlToken1 = trackedPool.tvlToken1;
    poolDayData.currentFeeRateBps = trackedPool.currentFeeRateBps; // Update daily fee rate
    poolDayData.save();
  }
}

export function handleSwap(event: SwapEvent): void {
  let poolId = event.params.id;
  let trackedPool = TrackedPool.load(poolId);

  if (trackedPool == null) {
      log.warning("Swap event for untracked pool: {}", [poolId.toHexString()]);
      return; 
  }

  let swapId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let swap = new Swap(swapId);
  swap.pool = poolId; 
  swap.timestamp = event.block.timestamp;
  swap.amount0 = event.params.amount0;
  swap.amount1 = event.params.amount1;
  swap.sender = event.params.sender;
  swap.recipient = event.params.sender; 
  swap.blockNumber = event.block.number;
  swap.blockTimestamp = event.block.timestamp;
  swap.transactionHash = event.transaction.hash;

  let token0 = Token.load(trackedPool.currency0)!;
  let token1 = Token.load(trackedPool.currency1)!;

  // CRITICAL: Convert swap amounts to TVL changes (following official Uniswap V4 approach)
  // Unlike V3, negative amount represents amount being sent to pool, so invert the sign
  let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals).times(BigDecimal.fromString('-1'));
  let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals).times(BigDecimal.fromString('-1'));

  // Update pool transaction count  
  trackedPool.txCount = trackedPool.txCount.plus(BigInt.fromI32(1));

  // Update pool TVL with swap token flows - THIS IS THE KEY MISSING PIECE!
  trackedPool.totalValueLockedToken0 = trackedPool.totalValueLockedToken0.plus(amount0);
  trackedPool.totalValueLockedToken1 = trackedPool.totalValueLockedToken1.plus(amount1);
  
  // Also update deprecated TVL fields for backward compatibility
  trackedPool.tvlToken0 = trackedPool.totalValueLockedToken0;
  trackedPool.tvlToken1 = trackedPool.totalValueLockedToken1;

  // Store pool state at time of swap
  swap.sqrtPriceX96 = event.params.sqrtPriceX96;
  swap.liquidity = event.params.liquidity; 
  swap.tick = event.params.tick;

  // Update pool state with swap data  
  trackedPool.sqrtPriceX96 = event.params.sqrtPriceX96;
  trackedPool.tick = event.params.tick;
  trackedPool.liquidity = event.params.liquidity;

  log.info("Swap in pool {}: {} {} for {} {} | Updated TVL: {} {} / {} {}", [
      poolId.toHexString(),
      amount0.toString(), token0.symbol,
      amount1.toString(), token1.symbol,
      trackedPool.totalValueLockedToken0.toString(), token0.symbol,
      trackedPool.totalValueLockedToken1.toString(), token1.symbol
  ]);
  
  // Log volume breakdown for debugging
  let inputToken = amount0.lt(BigDecimal.zero()) ? "token0" : "token1";
  let outputToken = amount0.gt(BigDecimal.zero()) ? "token0" : "token1";
  log.info("Volume breakdown - Input (w/fees): {} {}, Output (w/o fees): {} {}", [
      inputToken, 
      amount0.lt(BigDecimal.zero()) ? amount0.times(BigDecimal.fromString("-1")).toString() : amount1.times(BigDecimal.fromString("-1")).toString(),
      outputToken,
      amount0.gt(BigDecimal.zero()) ? amount0.toString() : amount1.toString()
  ]);

  // Update pool day data with directional volume tracking
  let poolDayData = getOrCreatePoolDayData(poolId, swap.timestamp);
  
  // Track volume with fees (input amounts) and without fees (output amounts)
  // In V4: negative amount = input to pool (includes fees), positive amount = output from pool (excludes fees)
  
  if (amount0.lt(BigDecimal.zero())) {
    // Token0 is input (includes fees) - add absolute value to volumeWFeeToken0
    let absAmount0 = amount0.times(BigDecimal.fromString("-1"));
    poolDayData.volumeWFeeToken0 = poolDayData.volumeWFeeToken0.plus(absAmount0);
  } else if (amount0.gt(BigDecimal.zero())) {
    // Token0 is output (excludes fees) - add to volumeToken0
    poolDayData.volumeToken0 = poolDayData.volumeToken0.plus(amount0);
  }
  
  if (amount1.lt(BigDecimal.zero())) {
    // Token1 is input (includes fees) - add absolute value to volumeWFeeToken1
    let absAmount1 = amount1.times(BigDecimal.fromString("-1"));
    poolDayData.volumeWFeeToken1 = poolDayData.volumeWFeeToken1.plus(absAmount1);
  } else if (amount1.gt(BigDecimal.zero())) {
    // Token1 is output (excludes fees) - add to volumeToken1
    poolDayData.volumeToken1 = poolDayData.volumeToken1.plus(amount1);
  } 

  // Update TVL in pool day data to reflect current values after swap
  poolDayData.tvlToken0 = trackedPool.tvlToken0;
  poolDayData.tvlToken1 = trackedPool.tvlToken1;
  poolDayData.currentFeeRateBps = trackedPool.currentFeeRateBps;

  // Log daily volume totals for debugging
  log.info("Daily volume totals for pool {} - wFee: {} {}, {} {} | w/oFee: {} {}, {} {}", [
      poolId.toHexString(),
      poolDayData.volumeWFeeToken0.toString(), token0.symbol,
      poolDayData.volumeWFeeToken1.toString(), token1.symbol,
      poolDayData.volumeToken0.toString(), token0.symbol,
      poolDayData.volumeToken1.toString(), token1.symbol
  ]);

  swap.save();
  poolDayData.save();
  trackedPool.save();
}

// New handler for FeeUpdated events from the AlphixHook
export function handleFeeUpdated(event: FeeUpdatedEvent): void {
  let poolId = event.params.poolId;
  let newFeeRate = BigInt.fromI32(event.params.newFee); // event.params.newFee is uint24

  log.info("FeeUpdate event: Pool {}, New Fee BPS: {}", [poolId.toHexString(), newFeeRate.toString()]);

  let trackedPool = TrackedPool.load(poolId);
  if (trackedPool == null) {
    log.warning("FeeUpdate event for untracked or unknown pool: {}", [poolId.toHexString()]);
    // This might happen if the hook emits FeeUpdated for a pool not yet initialized by PoolManager
    // or if there's a race condition / ordering issue. For now, we'll just log and return.
    // Consider creating a TrackedPool here if appropriate for your hook's logic,
    // but typically it should exist from PoolManager's Initialize.
    return;
  }

  // Create a FeeUpdate entity to record this change
  let feeUpdateId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let feeUpdate = new FeeUpdate(feeUpdateId);
  feeUpdate.pool = poolId;
  feeUpdate.timestamp = event.block.timestamp;
  feeUpdate.newFeeRateBps = newFeeRate;
  feeUpdate.transactionHash = event.transaction.hash;
  feeUpdate.save();

  // Update the current fee rate on the TrackedPool entity
  trackedPool.currentFeeRateBps = newFeeRate;
  trackedPool.save();

  // Update the current fee rate on today's PoolDayData entity
  // This ensures that PoolDayData reflects the fee rate at the end of the day, or the latest update during the day.
  let poolDayData = getOrCreatePoolDayData(poolId, event.block.timestamp);
  poolDayData.currentFeeRateBps = newFeeRate;
  poolDayData.save();
}