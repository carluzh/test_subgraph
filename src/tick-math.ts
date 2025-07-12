import { BigInt, BigDecimal } from "@graphprotocol/graph-ts";

// Constants for price calculations (adapted from official Uniswap V4 subgraph)
const Q192 = BigInt.fromI32(2).pow(192);
const Q96 = BigInt.fromI32(2).pow(96);
const ZERO_BD = BigDecimal.fromString("0");
const ONE_BD = BigDecimal.fromString("1");
const ZERO_BI = BigInt.fromI32(0);
const ONE_BI = BigInt.fromI32(1);
const BI_18 = BigInt.fromI32(18);

/**
 * Full Math Library - for high precision calculations
 * From official Uniswap V4 subgraph
 */
export abstract class FullMath {
  public static mulDivRoundingUp(a: BigInt, b: BigInt, denominator: BigInt): BigInt {
    const product = a.times(b);
    let result = product.div(denominator);
    if (product.mod(denominator).gt(ZERO_BI)) {
      result = result.plus(ONE_BI);
    }
    return result;
  }
}

/**
 * Proper hex string to BigInt converter - from official Uniswap V4 subgraph
 * This manually converts hex to decimal since BigInt.fromString() only handles decimal
 */
export function hexToBigInt(hex: string): BigInt {
  if (hex.startsWith('0x')) {
    hex = hex.slice(2);
  }
  let decimal = '0';
  for (let i = 0; i < hex.length; i++) {
    decimal = BigInt.fromString(decimal)
      .times(BigInt.fromI32(16))
      .plus(BigInt.fromI32(parseInt(hex.charAt(i), 16) as i32))
      .toString();
  }
  return BigInt.fromString(decimal);
}

/**
 * MaxUint256 constant - from official Uniswap V4 subgraph
 */
const MaxUint256 = hexToBigInt('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

/**
 * Multiply and right shift by 128 bits
 */
function mulShift(val: BigInt, mulBy: BigInt): BigInt {
  return val.times(mulBy).rightShift(128);
}

/**
 * Tick Math Library - converts ticks to sqrt ratios
 * EXACT implementation from official Uniswap V4 subgraph
 */
export abstract class TickMath {
  public static MIN_TICK: number = -887272;
  public static MAX_TICK: number = -TickMath.MIN_TICK;
  public static MIN_SQRT_RATIO: BigInt = BigInt.fromString('4295128739');
  public static MAX_SQRT_RATIO: BigInt = BigInt.fromString('1461446703485210103287273052203988822378723970342');

  public static getSqrtRatioAtTick(tick: i32): BigInt {
    if (tick < TickMath.MIN_TICK || tick > TickMath.MAX_TICK) {
      throw new Error('TICK');
    }
    const absTick: i32 = tick < 0 ? -tick : tick;

    let ratio: BigInt =
      (absTick & 0x1) != 0
        ? hexToBigInt('0xfffcb933bd6fad37aa2d162d1a594001')
        : hexToBigInt('0x100000000000000000000000000000000');
    
    if ((absTick & 0x2) != 0) ratio = mulShift(ratio, hexToBigInt('0xfff97272373d413259a46990580e213a'));
    if ((absTick & 0x4) != 0) ratio = mulShift(ratio, hexToBigInt('0xfff2e50f5f656932ef12357cf3c7fdcc'));
    if ((absTick & 0x8) != 0) ratio = mulShift(ratio, hexToBigInt('0xffe5caca7e10e4e61c3624eaa0941cd0'));
    if ((absTick & 0x10) != 0) ratio = mulShift(ratio, hexToBigInt('0xffcb9843d60f6159c9db58835c926644'));
    if ((absTick & 0x20) != 0) ratio = mulShift(ratio, hexToBigInt('0xff973b41fa98c081472e6896dfb254c0'));
    if ((absTick & 0x40) != 0) ratio = mulShift(ratio, hexToBigInt('0xff2ea16466c96a3843ec78b326b52861'));
    if ((absTick & 0x80) != 0) ratio = mulShift(ratio, hexToBigInt('0xfe5dee046a99a2a811c461f1969c3053'));
    if ((absTick & 0x100) != 0) ratio = mulShift(ratio, hexToBigInt('0xfcbe86c7900a88aedcffc83b479aa3a4'));
    if ((absTick & 0x200) != 0) ratio = mulShift(ratio, hexToBigInt('0xf987a7253ac413176f2b074cf7815e54'));
    if ((absTick & 0x400) != 0) ratio = mulShift(ratio, hexToBigInt('0xf3392b0822b70005940c7a398e4b70f3'));
    if ((absTick & 0x800) != 0) ratio = mulShift(ratio, hexToBigInt('0xe7159475a2c29b7443b29c7fa6e889d9'));
    if ((absTick & 0x1000) != 0) ratio = mulShift(ratio, hexToBigInt('0xd097f3bdfd2022b8845ad8f792aa5825'));
    if ((absTick & 0x2000) != 0) ratio = mulShift(ratio, hexToBigInt('0xa9f746462d870fdf8a65dc1f90e061e5'));
    if ((absTick & 0x4000) != 0) ratio = mulShift(ratio, hexToBigInt('0x70d869a156d2a1b890bb3df62baf32f7'));
    if ((absTick & 0x8000) != 0) ratio = mulShift(ratio, hexToBigInt('0x31be135f97d08fd981231505542fcfa6'));
    if ((absTick & 0x10000) != 0) ratio = mulShift(ratio, hexToBigInt('0x9aa508b5b7a84e1c677de54f3e99bc9'));
    if ((absTick & 0x20000) != 0) ratio = mulShift(ratio, hexToBigInt('0x5d6af8dedb81196699c329225ee604'));
    if ((absTick & 0x40000) != 0) ratio = mulShift(ratio, hexToBigInt('0x2216e584f5fa1ea926041bedfe98'));
    if ((absTick & 0x80000) != 0) ratio = mulShift(ratio, hexToBigInt('0x48a170391f7dc42444e8fa2'));

    // Use MaxUint256 constant and proper final calculation from official repo
    if (tick > 0) ratio = MaxUint256.div(ratio);

    return ratio
      .div(BigInt.fromI32(2).pow(32))
      .plus(ratio.mod(BigInt.fromI32(2).pow(32)).gt(BigInt.zero()) ? BigInt.fromI32(1) : BigInt.zero());
  }
}

/**
 * Sqrt Price Math Library - calculates token amounts from liquidity
 * From official Uniswap V4 subgraph
 */
export abstract class SqrtPriceMath {
  public static getAmount0Delta(
    sqrtRatioAX96: BigInt,
    sqrtRatioBX96: BigInt,
    liquidity: BigInt,
    roundUp: boolean,
  ): BigInt {
    if (sqrtRatioAX96.gt(sqrtRatioBX96)) {
      const temp = sqrtRatioAX96;
      sqrtRatioAX96 = sqrtRatioBX96;
      sqrtRatioBX96 = temp;
    }

    const numerator1 = liquidity.leftShift(96);
    const numerator2 = sqrtRatioBX96.minus(sqrtRatioAX96);

    return roundUp
      ? FullMath.mulDivRoundingUp(
          FullMath.mulDivRoundingUp(numerator1, numerator2, sqrtRatioBX96),
          ONE_BI,
          sqrtRatioAX96,
        )
      : numerator1.times(numerator2).div(sqrtRatioBX96).div(sqrtRatioAX96);
  }

  public static getAmount1Delta(
    sqrtRatioAX96: BigInt,
    sqrtRatioBX96: BigInt,
    liquidity: BigInt,
    roundUp: boolean,
  ): BigInt {
    if (sqrtRatioAX96.gt(sqrtRatioBX96)) {
      const temp = sqrtRatioAX96;
      sqrtRatioAX96 = sqrtRatioBX96;
      sqrtRatioBX96 = temp;
    }

    const difference = sqrtRatioBX96.minus(sqrtRatioAX96);

    return roundUp 
      ? FullMath.mulDivRoundingUp(liquidity, difference, Q96) 
      : liquidity.times(difference).div(Q96);
  }
}

/**
 * Liquidity Amounts Library - main functions to get token amounts from liquidity
 * From official Uniswap V4 subgraph
 */
export function getAmount0(
  tickLower: i32,
  tickUpper: i32,
  currTick: i32,
  amount: BigInt,
  currSqrtPriceX96: BigInt,
): BigInt {
  const sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(tickLower);
  const sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(tickUpper);

  let amount0 = ZERO_BI;
  const roundUp = amount.gt(ZERO_BI);

  if (currTick < tickLower) {
    amount0 = SqrtPriceMath.getAmount0Delta(sqrtRatioAX96, sqrtRatioBX96, amount, roundUp);
  } else if (currTick < tickUpper) {
    amount0 = SqrtPriceMath.getAmount0Delta(currSqrtPriceX96, sqrtRatioBX96, amount, roundUp);
  } else {
    amount0 = ZERO_BI;
  }

  return amount0;
}

export function getAmount1(
  tickLower: i32,
  tickUpper: i32,
  currTick: i32,
  amount: BigInt,
  currSqrtPriceX96: BigInt,
): BigInt {
  const sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(tickLower);
  const sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(tickUpper);

  let amount1 = ZERO_BI;
  const roundUp = amount.gt(ZERO_BI);

  if (currTick < tickLower) {
    amount1 = ZERO_BI;
  } else if (currTick < tickUpper) {
    amount1 = SqrtPriceMath.getAmount1Delta(sqrtRatioAX96, currSqrtPriceX96, amount, roundUp);
  } else {
    amount1 = SqrtPriceMath.getAmount1Delta(sqrtRatioAX96, sqrtRatioBX96, amount, roundUp);
  }

  return amount1;
}

/**
 * Convert sqrtPriceX96 to token prices using proven approach
 */
export function sqrtPriceX96ToTokenPrices(sqrtPriceX96: BigInt): BigDecimal[] {
  let num = sqrtPriceX96.times(sqrtPriceX96).toBigDecimal();
  let denom = BigDecimal.fromString(Q192.toString());
  
  let price1 = num
    .div(denom)
    .times(exponentToBigDecimal(BI_18))
    .div(exponentToBigDecimal(BI_18));

  let price0 = safeDiv(ONE_BD, price1);
  
  return [price0, price1];
}

/**
 * Calculate 10^decimals as BigDecimal
 */
export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = ONE_BD;
  
  for (let i = ZERO_BI; i.lt(decimals); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString("10"));
  }
  return bd;
}

/**
 * Safe division that returns 0 if denominator is 0
 */
export function safeDiv(amount0: BigDecimal, amount1: BigDecimal): BigDecimal {
  if (amount1.equals(ZERO_BD)) {
    return ZERO_BD;
  } else {
    return amount0.div(amount1);
  }
}

/**
 * Adjust token amounts for different decimal places
 */
export function adjustForDecimals(amount: BigInt, decimals: i32): BigDecimal {
  let divisor = BigInt.fromI32(10).pow(decimals as u8);
  return amount.toBigDecimal().div(divisor.toBigDecimal());
} 