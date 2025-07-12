import { Address, BigInt, Bytes, store, log, BigDecimal } from "@graphprotocol/graph-ts";

// Import price calculation utilities and liquidity math from official Uniswap V4 approach
import { 
  sqrtPriceX96ToTokenPrices,
  adjustForDecimals,
  getAmount0,
  getAmount1 
} from "./tick-math";

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

// Hardcoded Hook ID to filter by
const HARDCODED_HOOK_ID_STRING = "0x94ba380a340E020Dc29D7883f01628caBC975000";
const HARDCODED_HOOK_ID_BYTES = Bytes.fromHexString(HARDCODED_HOOK_ID_STRING);

// Token addresses and USD prices
const BTCRL_ADDRESS = Bytes.fromHexString("0x13c26fb69d48ed5a72ce3302fc795082e2427f4d");
const YUSDC_ADDRESS = Bytes.fromHexString("0x663cf82e49419a3dc88eec65c2155b4b2d0fa335");
const MUSDT_ADDRESS = Bytes.fromHexString("0xbaabfA3Ac2Ed3d0154e9E2002f94D8550A79bfa8");
const AETH_ADDRESS = Bytes.fromHexString("0x28c00749Cb9066d240fE1270b6D7f294b8b34D99");
const ETH_ADDRESS = Bytes.fromHexString("0x0000000000000000000000000000000000000000");

// USD stable token prices (fixed at $1.00)
const YUSDC_USD_PRICE = BigDecimal.fromString("1.0");
const MUSDT_USD_PRICE = BigDecimal.fromString("1.0");

// Pool IDs for price derivation
const YUSDC_MUSDT_POOL_ID = Bytes.fromHexString("0xc176e54fee5a41917ae5244d8235e0bda1885de86b47f540a09552119d832e6d");
const MUSDT_AETH_POOL_ID = Bytes.fromHexString("0x60F36C23D5131AE2EA1CD668AE4013081FD24B9CF94190BB6E08ECE00B8DC27C");
const MUSDT_ETH_POOL_ID = Bytes.fromHexString("0xB0679FC770CC387A0DE3099368FD7AD8BD0EFB599525C40F3586AFF55D797EB1");

// --- StateView Contract Address ---
const STATEVIEW_CONTRACT_ADDRESS = Address.fromString('0x571291b572ed32ce6751a2cb2486ebee8defb9b4');

// Helper function to fetch token details
function fetchTokenDetails(tokenAddress: Address): Token {
  let token = Token.load(tokenAddress); 
  if (token == null) {
    token = new Token(tokenAddress);
    
    // Handle native ETH (zero address) as a special case
    if (tokenAddress.toHexString() == "0x0000000000000000000000000000000000000000") {
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
    
    // Initialize raw token volumes (no USD conversion)
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
    if (tokenAddress.toHexString() == "0x0000000000000000000000000000000000000000") {
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
    if (tokenAddress.equals(YUSDC_ADDRESS) || tokenAddress.equals(MUSDT_ADDRESS)) {
        return BigDecimal.fromString("1.0");
    }
    
    // For other tokens, derive price from relevant pools
    let stateViewContract = StateView.bind(STATEVIEW_CONTRACT_ADDRESS);
    
    if (tokenAddress.equals(AETH_ADDRESS)) {
        // Derive aETH price from mUSDT/aETH pool
        let getSlot0Call = stateViewContract.try_getSlot0(MUSDT_AETH_POOL_ID);
        if (!getSlot0Call.reverted) {
            return deriveTokenPriceFromUsdPool(getSlot0Call.value.value0.toBigDecimal(), MUSDT_AETH_POOL_ID, AETH_ADDRESS, MUSDT_ADDRESS);
        }
    } else if (tokenAddress.equals(ETH_ADDRESS)) {
        // Derive ETH price from mUSDT/ETH pool
        let getSlot0Call = stateViewContract.try_getSlot0(MUSDT_ETH_POOL_ID);
        if (!getSlot0Call.reverted) {
            return deriveTokenPriceFromUsdPool(getSlot0Call.value.value0.toBigDecimal(), MUSDT_ETH_POOL_ID, ETH_ADDRESS, MUSDT_ADDRESS);
        }
    }
    // For BTCRL, we'll handle it in a separate function since we need to find the pool dynamically
    
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
    if (tokenAddress.equals(YUSDC_ADDRESS) || tokenAddress.equals(MUSDT_ADDRESS)) {
        return BigDecimal.fromString("1.0");
    }
    
    // Check if we can derive price from the current pool context
    let contextPool = TrackedPool.load(contextPoolId);
    if (contextPool != null) {
        let token0 = Token.load(contextPool.currency0)!;
        let token1 = Token.load(contextPool.currency1)!;
        
        // If current pool contains the target token + a USD token, derive price from it
        if ((token0.id.equals(tokenAddress) && (token1.id.equals(YUSDC_ADDRESS) || token1.id.equals(MUSDT_ADDRESS))) ||
            (token1.id.equals(tokenAddress) && (token0.id.equals(YUSDC_ADDRESS) || token0.id.equals(MUSDT_ADDRESS)))) {
            
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
    if (token0.id.equals(targetTokenAddress) && (token1.id.equals(YUSDC_ADDRESS) || token1.id.equals(MUSDT_ADDRESS))) {
        // Target token is token0, USD token is token1
        // Price of target = 1 / (price of token1 in token0) = 1 / adjustedPrice
        return BigDecimal.fromString("1.0").div(adjustedPriceOfToken1InToken0);
    } else if (token1.id.equals(targetTokenAddress) && (token0.id.equals(YUSDC_ADDRESS) || token0.id.equals(MUSDT_ADDRESS))) {
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

  let amount0_bd = event.params.amount0.toBigDecimal();
  let amount1_bd = event.params.amount1.toBigDecimal();
  let feeRateBps = trackedPool.currentFeeRateBps.toBigDecimal(); 

  let token0 = Token.load(trackedPool.currency0)!;
  let token1 = Token.load(trackedPool.currency1)!;

  // Get USD prices for both tokens using context-aware pricing
  let token0PriceUSD = getTokenPriceUSDWithContext(token0.id, poolId);
  let token1PriceUSD = getTokenPriceUSDWithContext(token1.id, poolId);

  log.info("Swap Vol Calc: Pool {} - Token prices: {} = ${}, {} = ${}", [
      poolId.toHexString(),
      token0.symbol, token0PriceUSD.toString(),
      token1.symbol, token1PriceUSD.toString()
  ]);

  // Convert raw amounts to adjusted amounts (accounting for decimals)
  let amount0Adjusted = amount0_bd.div(BigInt.fromI32(10).pow(token0.decimals.toI32() as u8).toBigDecimal());
  let amount1Adjusted = amount1_bd.div(BigInt.fromI32(10).pow(token1.decimals.toI32() as u8).toBigDecimal());

  // Calculate USD volumes for both sides of the swap
  let volume0USD = amount0Adjusted.times(token0PriceUSD);
  let volume1USD = amount1Adjusted.times(token1PriceUSD);

  // Take absolute values since we want volume, not directional amounts
  if (volume0USD.lt(BigDecimal.zero())) {
      volume0USD = volume0USD.times(BigDecimal.fromString("-1.0"));
  }
  if (volume1USD.lt(BigDecimal.zero())) {
      volume1USD = volume1USD.times(BigDecimal.fromString("-1.0"));
  }

  // Use the larger of the two USD volumes (they should be approximately equal in a well-functioning pool)
  // But we prefer the volume from the token with a non-zero price
  let amountUSD = BigDecimal.zero();
  if (token0PriceUSD.gt(BigDecimal.zero()) && token1PriceUSD.gt(BigDecimal.zero())) {
      // Both tokens have prices, use the average
      amountUSD = volume0USD.plus(volume1USD).div(BigDecimal.fromString("2.0"));
  } else if (token0PriceUSD.gt(BigDecimal.zero())) {
      // Only token0 has a price
      amountUSD = volume0USD;
  } else if (token1PriceUSD.gt(BigDecimal.zero())) {
      // Only token1 has a price
      amountUSD = volume1USD;
  } else {
      // Neither token has a price
      log.warning("Swap event for unsupported token pair (no USD prices available): {}", [poolId.toHexString()]);
      amountUSD = BigDecimal.zero();
  }

  // Store pool state at time of swap
  swap.sqrtPriceX96 = event.params.sqrtPriceX96;
  swap.liquidity = event.params.liquidity; 
  swap.tick = event.params.tick;

  // Update pool state with swap data  
  trackedPool.sqrtPriceX96 = event.params.sqrtPriceX96;
  trackedPool.tick = event.params.tick;
  trackedPool.liquidity = event.params.liquidity;

  log.info("Swap in pool {}: {} {} for {} {}", [
      poolId.toHexString(),
      amount0Adjusted.toString(),
      token0.symbol,
      amount1Adjusted.toString(), 
      token1.symbol
  ]);

  // Update pool day data with raw token volumes
  let poolDayData = getOrCreatePoolDayData(poolId, swap.timestamp);
  
  // Add absolute values of swapped amounts to daily volume
  let absAmount0 = amount0Adjusted.lt(BigDecimal.zero()) ? amount0Adjusted.times(BigDecimal.fromString("-1")) : amount0Adjusted;
  let absAmount1 = amount1Adjusted.lt(BigDecimal.zero()) ? amount1Adjusted.times(BigDecimal.fromString("-1")) : amount1Adjusted;
  
  poolDayData.volumeToken0 = poolDayData.volumeToken0.plus(absAmount0);
  poolDayData.volumeToken1 = poolDayData.volumeToken1.plus(absAmount1); 

  // Update TVL in pool day data (already maintained in pool entity)
  poolDayData.tvlToken0 = trackedPool.tvlToken0;
  poolDayData.tvlToken1 = trackedPool.tvlToken1;
  poolDayData.currentFeeRateBps = trackedPool.currentFeeRateBps;

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