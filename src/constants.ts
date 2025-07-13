import { Address, Bytes, BigDecimal } from "@graphprotocol/graph-ts";

// Network configuration
export const NETWORK = "base-sepolia";

// Contract addresses
export const POOL_MANAGER_ADDRESS = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408";
export const ALPHIX_HOOK_ADDRESS = "0xd450f7f8e4C11EE8620a349f73e7aC3905Dfd000";
export const STATEVIEW_CONTRACT_ADDRESS = Address.fromString("0x571291b572ed32ce6751a2cb2486ebee8defb9b4");

// Start blocks
export const POOL_MANAGER_START_BLOCK = 25679774;
export const ALPHIX_HOOK_START_BLOCK = 25751472;

// Hook configuration
export const HARDCODED_HOOK_ID_STRING = "0xd450f7f8e4C11EE8620a349f73e7aC3905Dfd000";
export const HARDCODED_HOOK_ID_BYTES = Bytes.fromHexString(HARDCODED_HOOK_ID_STRING);

// Token addresses
export const aUSDC_ADDRESS = Bytes.fromHexString("0x24429b8f2C8ebA374Dd75C0a72BCf4dF4C545BeD");
export const aUSDT_ADDRESS = Bytes.fromHexString("0x9F785fEb65DBd0170bd6Ca1A045EEda44ae9b4dC");
export const aETH_ADDRESS = Bytes.fromHexString("0xE7711aa6557A69592520Bbe7D704D64438f160e7");
export const aBTC_ADDRESS = Bytes.fromHexString("0x9d5F910c91E69ADDDB06919825305eFEa5c9c604");
export const ETH_ADDRESS = Bytes.fromHexString("0x0000000000000000000000000000000000000000");

// USD stable token prices (fixed at $1.00)
export const aUSDC_USD_PRICE = BigDecimal.fromString("1.0");
export const aUSDT_USD_PRICE = BigDecimal.fromString("1.0");

// Pool IDs for price derivation
export const aUSDC_aUSDT_POOL_ID = Bytes.fromHexString("0xfaa0e80397dda369eb68f6f67c9cd4d4884841f1417078e20844addc11170127");
export const aUSDT_aETH_POOL_ID = Bytes.fromHexString("0x4e1b037b56e13bea1dfe20e8f592b95732cc52b5b10777b9f9bea856c145e7c7");
export const aBTC_aETH_POOL_ID = Bytes.fromHexString("0xe9b5f2692da366148c42074373f37d00f368edcae46bcf7e39dd1aab5207d7c2");
export const aUSDC_aBTC_POOL_ID = Bytes.fromHexString("0x8392f09ccc3c387d027d189f13a1f1f2e9d73f34011191a3d58157b9b2bf8bdd");
export const ETH_aUSDT_POOL_ID = Bytes.fromHexString("0xe6a2c6909de49149dced232f472247979fdc098cd2de74b0923e3cefb5602c15");

// Additional contract addresses
export const ALPHIX_MANAGER_ADDRESS = Address.fromString("0x6747d49A460Ea87cf57a2Bceab288C8D152cDd03");
export const DEPLOYER_ADDRESS = Address.fromString("0x6747d49A460Ea87cf57a2Bceab288C8D152cDd03");
export const SATOSHUI_ADDRESS = Address.fromString("0xBF0BD19b7f85f314Db0D3f445b83b3013C6345fc");
export const POSITION_MANAGER_ADDRESS = Address.fromString("0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80");
export const POOL_SWAP_TEST_ROUTER_ADDRESS = Address.fromString("0x8b5bcc363dde2614281ad875bad385e0a785d3b9");
export const CREATE2_DEPLOYER_ADDRESS = Address.fromString("0x4e59b44847b379578588920cA78FbF26c0B4956C");
export const FAUCET_ADDRESS = Address.fromString("0x5634bA278a0655F88432C6dFAC22338361bBaC00");

// Fee configuration
export const INITIAL_FEE = 2000;
export const INITIAL_TARGET_RATIO = BigDecimal.fromString("1000000000000000000");
export const CURRENT_RATIO = BigDecimal.fromString("700000000000000000"); 