import { Address, Bytes, BigInt, BigDecimal } from "@graphprotocol/graph-ts";

// Network configuration interface
export class NetworkConfig {
  // Contract addresses
  static poolManagerAddress(): Address {
    return Address.fromString("0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408");
  }
  
  static alphixHookAddress(): Address {
    return Address.fromString("0xd450f7f8e4C11EE8620a349f73e7aC3905Dfd000");
  }
  
  static alphixManagerAddress(): Address {
    return Address.fromString("0x6747d49A460Ea87cf57a2Bceab288C8D152cDd03");
  }
  
  static deployerAddress(): Address {
    return Address.fromString("0x6747d49A460Ea87cf57a2Bceab288C8D152cDd03");
  }
  
  static positionManagerAddress(): Address {
    return Address.fromString("0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80");
  }
  
  static poolSwapTestRouterAddress(): Address {
    return Address.fromString("0x8b5bcc363dde2614281ad875bad385e0a785d3b9");
  }
  
  static create2DeployerAddress(): Address {
    return Address.fromString("0x4e59b44847b379578588920cA78FbF26c0B4956C");
  }
  
  static faucetAddress(): Address {
    return Address.fromString("0x5634bA278a0655F88432C6dFAC22338361bBaC00");
  }

  // Hook ID constants
  static hardcodedHookIdString(): string {
    return "0xd450f7f8e4C11EE8620a349f73e7aC3905Dfd000";
  }
  
  static hardcodedHookIdBytes(): Bytes {
    return Bytes.fromHexString("0xd450f7f8e4C11EE8620a349f73e7aC3905Dfd000");
  }

  // Token addresses
  static ausdcAddress(): Bytes {
    return Bytes.fromHexString("0x24429b8f2C8ebA374Dd75C0a72BCf4dF4C545BeD");
  }
  
  static ausdtAddress(): Bytes {
    return Bytes.fromHexString("0x9F785fEb65DBd0170bd6Ca1A045EEda44ae9b4dC");
  }
  
  static aethAddress(): Bytes {
    return Bytes.fromHexString("0xE7711aa6557A69592520Bbe7D704D64438f160e7");
  }
  
  static abtcAddress(): Bytes {
    return Bytes.fromHexString("0x9d5F910c91E69ADDDB06919825305eFEa5c9c604");
  }
  
  static ethAddress(): Bytes {
    return Bytes.fromHexString("0x0000000000000000000000000000000000000000");
  }

  // USD stable token prices (fixed at $1.00)
  static ausdcUsdPrice(): BigDecimal {
    return BigDecimal.fromString("1.0");
  }
  
  static ausdtUsdPrice(): BigDecimal {
    return BigDecimal.fromString("1.0");
  }

  // Pool IDs for price derivation
  static ausdcAusdtPoolId(): Bytes {
    return Bytes.fromHexString("0xfaa0e80397dda369eb68f6f67c9cd4d4884841f1417078e20844addc11170127");
  }
  
  static ausdtAethPoolId(): Bytes {
    return Bytes.fromHexString("0x4e1b037b56e13bea1dfe20e8f592b95732cc52b5b10777b9f9bea856c145e7c7");
  }
  
  static abtcAethPoolId(): Bytes {
    return Bytes.fromHexString("0xe9b5f2692da366148c42074373f37d00f368edcae46bcf7e39dd1aab5207d7c2");
  }
  
  static ausdcAbtcPoolId(): Bytes {
    return Bytes.fromHexString("0x8392f09ccc3c387d027d189f13a1f1f2e9d73f34011191a3d58157b9b2bf8bdd");
  }
  
  static ethAusdtPoolId(): Bytes {
    return Bytes.fromHexString("0xe6a2c6909de49149dced232f472247979fdc098cd2de74b0923e3cefb5602c15");
  }

  // Helper functions to check token types
  static isStableToken(tokenAddress: Bytes): boolean {
    return tokenAddress.equals(NetworkConfig.ausdcAddress()) || 
           tokenAddress.equals(NetworkConfig.ausdtAddress());
  }

  static getStableTokenPrice(tokenAddress: Bytes): BigDecimal {
    if (tokenAddress.equals(NetworkConfig.ausdcAddress())) {
      return NetworkConfig.ausdcUsdPrice();
    } else if (tokenAddress.equals(NetworkConfig.ausdtAddress())) {
      return NetworkConfig.ausdtUsdPrice();
    }
    return BigDecimal.zero();
  }

  // Get price reference pool for a token
  static getPriceReferencePool(tokenAddress: Bytes): Bytes | null {
    if (tokenAddress.equals(NetworkConfig.aethAddress())) {
      return NetworkConfig.ausdtAethPoolId(); // Can also use abtcAethPoolId()
    } else if (tokenAddress.equals(NetworkConfig.ethAddress())) {
      return NetworkConfig.ethAusdtPoolId();
    } else if (tokenAddress.equals(NetworkConfig.abtcAddress())) {
      return NetworkConfig.abtcAethPoolId(); // Can also use ausdcAbtcPoolId()
    }
    return null;
  }

  // Get USD reference token for a given price pool
  static getUsdReferenceToken(poolId: Bytes): Bytes | null {
    if (poolId.equals(NetworkConfig.ausdtAethPoolId()) || 
        poolId.equals(NetworkConfig.ethAusdtPoolId())) {
      return NetworkConfig.ausdtAddress();
    } else if (poolId.equals(NetworkConfig.ausdcAusdtPoolId()) ||
               poolId.equals(NetworkConfig.ausdcAbtcPoolId())) {
      return NetworkConfig.ausdcAddress(); // Both aUSDC and aUSDT are stable
    }
    return null;
  }
}

// Token configuration helper
export class TokenConfig {
  static getTokenSymbol(tokenAddress: Bytes): string {
    if (tokenAddress.equals(NetworkConfig.ausdcAddress())) {
      return "aUSDC";
    } else if (tokenAddress.equals(NetworkConfig.ausdtAddress())) {
      return "aUSDT";
    } else if (tokenAddress.equals(NetworkConfig.aethAddress())) {
      return "aETH";
    } else if (tokenAddress.equals(NetworkConfig.abtcAddress())) {
      return "aBTC";
    } else if (tokenAddress.equals(NetworkConfig.ethAddress())) {
      return "ETH";
    }
    return "UNKNOWN";
  }

  static getTokenDecimals(tokenAddress: Bytes): i32 {
    if (tokenAddress.equals(NetworkConfig.ausdcAddress()) || 
        tokenAddress.equals(NetworkConfig.ausdtAddress())) {
      return 6;
    } else if (tokenAddress.equals(NetworkConfig.aethAddress()) || 
               tokenAddress.equals(NetworkConfig.ethAddress())) {
      return 18;
    } else if (tokenAddress.equals(NetworkConfig.abtcAddress())) {
      return 8;
    }
    return 18; // Default to 18 decimals
  }
}

// Pool configuration helper
export class PoolConfig {
  static getPoolDescription(poolId: Bytes): string {
    if (poolId.equals(NetworkConfig.ausdcAusdtPoolId())) {
      return "aUSDC/aUSDT price reference pool";
    } else if (poolId.equals(NetworkConfig.ausdtAethPoolId())) {
      return "aUSDT/aETH price reference pool";
    } else if (poolId.equals(NetworkConfig.abtcAethPoolId())) {
      return "aBTC/aETH price reference pool";
    } else if (poolId.equals(NetworkConfig.ausdcAbtcPoolId())) {
      return "aUSDC/aBTC price reference pool";
    } else if (poolId.equals(NetworkConfig.ethAusdtPoolId())) {
      return "ETH/aUSDT price reference pool";
    }
    return "Unknown pool";
  }

  static isPriceReferencePool(poolId: Bytes): boolean {
    return poolId.equals(NetworkConfig.ausdcAusdtPoolId()) ||
           poolId.equals(NetworkConfig.ausdtAethPoolId()) ||
           poolId.equals(NetworkConfig.abtcAethPoolId()) ||
           poolId.equals(NetworkConfig.ausdcAbtcPoolId()) ||
           poolId.equals(NetworkConfig.ethAusdtPoolId());
  }

  static getInitialFee(poolId: Bytes): i32 {
    if (poolId.equals(NetworkConfig.ausdcAusdtPoolId())) {
      return 100;
    } else if (poolId.equals(NetworkConfig.ausdtAethPoolId())) {
      return 1000;
    } else if (poolId.equals(NetworkConfig.abtcAethPoolId())) {
      return 3000;
    } else if (poolId.equals(NetworkConfig.ausdcAbtcPoolId())) {
      return 5000;
    } else if (poolId.equals(NetworkConfig.ethAusdtPoolId())) {
      return 2000;
    }
    return 3000; // Default fee
  }

  static getTickSpacing(poolId: Bytes): i32 {
    if (poolId.equals(NetworkConfig.ausdcAusdtPoolId())) {
      return 1;
    } else if (poolId.equals(NetworkConfig.ausdtAethPoolId())) {
      return 100;
    } else if (poolId.equals(NetworkConfig.abtcAethPoolId())) {
      return 60;
    } else if (poolId.equals(NetworkConfig.ausdcAbtcPoolId())) {
      return 80;
    } else if (poolId.equals(NetworkConfig.ethAusdtPoolId())) {
      return 45;
    }
    return 60; // Default tick spacing
  }
} 