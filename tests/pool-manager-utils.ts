import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  Approval,
  Donate,
  Initialize,
  ModifyLiquidity,
  OperatorSet,
  OwnershipTransferred,
  ProtocolFeeControllerUpdated,
  ProtocolFeeUpdated,
  Swap,
  Transfer
} from "../generated/PoolManager/PoolManager"

export function createApprovalEvent(
  owner: Address,
  spender: Address,
  id: BigInt,
  amount: BigInt
): Approval {
  let approvalEvent = changetype<Approval>(newMockEvent())

  approvalEvent.parameters = new Array()

  approvalEvent.parameters.push(
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(owner))
  )
  approvalEvent.parameters.push(
    new ethereum.EventParam("spender", ethereum.Value.fromAddress(spender))
  )
  approvalEvent.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  )
  approvalEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return approvalEvent
}

export function createDonateEvent(
  id: Bytes,
  sender: Address,
  amount0: BigInt,
  amount1: BigInt
): Donate {
  let donateEvent = changetype<Donate>(newMockEvent())

  donateEvent.parameters = new Array()

  donateEvent.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromFixedBytes(id))
  )
  donateEvent.parameters.push(
    new ethereum.EventParam("sender", ethereum.Value.fromAddress(sender))
  )
  donateEvent.parameters.push(
    new ethereum.EventParam(
      "amount0",
      ethereum.Value.fromUnsignedBigInt(amount0)
    )
  )
  donateEvent.parameters.push(
    new ethereum.EventParam(
      "amount1",
      ethereum.Value.fromUnsignedBigInt(amount1)
    )
  )

  return donateEvent
}

export function createInitializeEvent(
  id: Bytes,
  currency0: Address,
  currency1: Address,
  fee: i32,
  tickSpacing: i32,
  hooks: Address,
  sqrtPriceX96: BigInt,
  tick: i32
): Initialize {
  let initializeEvent = changetype<Initialize>(newMockEvent())

  initializeEvent.parameters = new Array()

  initializeEvent.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromFixedBytes(id))
  )
  initializeEvent.parameters.push(
    new ethereum.EventParam("currency0", ethereum.Value.fromAddress(currency0))
  )
  initializeEvent.parameters.push(
    new ethereum.EventParam("currency1", ethereum.Value.fromAddress(currency1))
  )
  initializeEvent.parameters.push(
    new ethereum.EventParam(
      "fee",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(fee))
    )
  )
  initializeEvent.parameters.push(
    new ethereum.EventParam("tickSpacing", ethereum.Value.fromI32(tickSpacing))
  )
  initializeEvent.parameters.push(
    new ethereum.EventParam("hooks", ethereum.Value.fromAddress(hooks))
  )
  initializeEvent.parameters.push(
    new ethereum.EventParam(
      "sqrtPriceX96",
      ethereum.Value.fromUnsignedBigInt(sqrtPriceX96)
    )
  )
  initializeEvent.parameters.push(
    new ethereum.EventParam("tick", ethereum.Value.fromI32(tick))
  )

  return initializeEvent
}

export function createModifyLiquidityEvent(
  id: Bytes,
  sender: Address,
  tickLower: i32,
  tickUpper: i32,
  liquidityDelta: BigInt,
  salt: Bytes
): ModifyLiquidity {
  let modifyLiquidityEvent = changetype<ModifyLiquidity>(newMockEvent())

  modifyLiquidityEvent.parameters = new Array()

  modifyLiquidityEvent.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromFixedBytes(id))
  )
  modifyLiquidityEvent.parameters.push(
    new ethereum.EventParam("sender", ethereum.Value.fromAddress(sender))
  )
  modifyLiquidityEvent.parameters.push(
    new ethereum.EventParam("tickLower", ethereum.Value.fromI32(tickLower))
  )
  modifyLiquidityEvent.parameters.push(
    new ethereum.EventParam("tickUpper", ethereum.Value.fromI32(tickUpper))
  )
  modifyLiquidityEvent.parameters.push(
    new ethereum.EventParam(
      "liquidityDelta",
      ethereum.Value.fromSignedBigInt(liquidityDelta)
    )
  )
  modifyLiquidityEvent.parameters.push(
    new ethereum.EventParam("salt", ethereum.Value.fromFixedBytes(salt))
  )

  return modifyLiquidityEvent
}

export function createOperatorSetEvent(
  owner: Address,
  operator: Address,
  approved: boolean
): OperatorSet {
  let operatorSetEvent = changetype<OperatorSet>(newMockEvent())

  operatorSetEvent.parameters = new Array()

  operatorSetEvent.parameters.push(
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(owner))
  )
  operatorSetEvent.parameters.push(
    new ethereum.EventParam("operator", ethereum.Value.fromAddress(operator))
  )
  operatorSetEvent.parameters.push(
    new ethereum.EventParam("approved", ethereum.Value.fromBoolean(approved))
  )

  return operatorSetEvent
}

export function createOwnershipTransferredEvent(
  user: Address,
  newOwner: Address
): OwnershipTransferred {
  let ownershipTransferredEvent =
    changetype<OwnershipTransferred>(newMockEvent())

  ownershipTransferredEvent.parameters = new Array()

  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  )

  return ownershipTransferredEvent
}

export function createProtocolFeeControllerUpdatedEvent(
  protocolFeeController: Address
): ProtocolFeeControllerUpdated {
  let protocolFeeControllerUpdatedEvent =
    changetype<ProtocolFeeControllerUpdated>(newMockEvent())

  protocolFeeControllerUpdatedEvent.parameters = new Array()

  protocolFeeControllerUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "protocolFeeController",
      ethereum.Value.fromAddress(protocolFeeController)
    )
  )

  return protocolFeeControllerUpdatedEvent
}

export function createProtocolFeeUpdatedEvent(
  id: Bytes,
  protocolFee: i32
): ProtocolFeeUpdated {
  let protocolFeeUpdatedEvent = changetype<ProtocolFeeUpdated>(newMockEvent())

  protocolFeeUpdatedEvent.parameters = new Array()

  protocolFeeUpdatedEvent.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromFixedBytes(id))
  )
  protocolFeeUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "protocolFee",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(protocolFee))
    )
  )

  return protocolFeeUpdatedEvent
}

export function createSwapEvent(
  id: Bytes,
  sender: Address,
  amount0: BigInt,
  amount1: BigInt,
  sqrtPriceX96: BigInt,
  liquidity: BigInt,
  tick: i32,
  fee: i32
): Swap {
  let swapEvent = changetype<Swap>(newMockEvent())

  swapEvent.parameters = new Array()

  swapEvent.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromFixedBytes(id))
  )
  swapEvent.parameters.push(
    new ethereum.EventParam("sender", ethereum.Value.fromAddress(sender))
  )
  swapEvent.parameters.push(
    new ethereum.EventParam("amount0", ethereum.Value.fromSignedBigInt(amount0))
  )
  swapEvent.parameters.push(
    new ethereum.EventParam("amount1", ethereum.Value.fromSignedBigInt(amount1))
  )
  swapEvent.parameters.push(
    new ethereum.EventParam(
      "sqrtPriceX96",
      ethereum.Value.fromUnsignedBigInt(sqrtPriceX96)
    )
  )
  swapEvent.parameters.push(
    new ethereum.EventParam(
      "liquidity",
      ethereum.Value.fromUnsignedBigInt(liquidity)
    )
  )
  swapEvent.parameters.push(
    new ethereum.EventParam("tick", ethereum.Value.fromI32(tick))
  )
  swapEvent.parameters.push(
    new ethereum.EventParam(
      "fee",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(fee))
    )
  )

  return swapEvent
}

export function createTransferEvent(
  caller: Address,
  from: Address,
  to: Address,
  id: BigInt,
  amount: BigInt
): Transfer {
  let transferEvent = changetype<Transfer>(newMockEvent())

  transferEvent.parameters = new Array()

  transferEvent.parameters.push(
    new ethereum.EventParam("caller", ethereum.Value.fromAddress(caller))
  )
  transferEvent.parameters.push(
    new ethereum.EventParam("from", ethereum.Value.fromAddress(from))
  )
  transferEvent.parameters.push(
    new ethereum.EventParam("to", ethereum.Value.fromAddress(to))
  )
  transferEvent.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  )
  transferEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return transferEvent
}
