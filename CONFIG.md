# Configuration System

This subgraph now uses a modular configuration system that allows you to easily deploy to different networks without hardcoding addresses in the source code.

## Configuration Structure

All network-specific configuration is stored in `networks.json`:

```json
{
  "base-sepolia": {
    "contracts": {
      "PoolManager": {
        "address": "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408",
        "startBlock": 25679774
      },
      "AlphixHook": {
        "address": "0x94ba380a340E020Dc29D7883f01628caBC975000",
        "startBlock": 25751472
      },
      "StateView": {
        "address": "0x571291b572ed32ce6751a2cb2486ebee8defb9b4"
      }
    },
    "tokens": {
      "YUSDC": {
        "address": "0x663cf82e49419a3dc88eec65c2155b4b2d0fa335",
        "symbol": "YUSDC",
        "decimals": 6,
        "priceUSD": "1.0"
      },
      // ... other tokens
    },
    "pools": {
      "YUSDC_MUSDT": {
        "id": "0xc176e54fee5a41917ae5244d8235e0bda1885de86b47f540a09552119d832e6d",
        "token0": "YUSDC",
        "token1": "MUSDT",
        "description": "YUSDC/MUSDT price reference pool"
      }
      // ... other pools
    }
  }
}
```

## How It Works

### 1. Template System

The build system uses a template-based approach:

- `subgraph.template.yaml` - Template file with placeholders like `{{NETWORK}}`, `{{POOL_MANAGER_ADDRESS}}`
- `scripts/build-subgraph.js` - Build script that generates `subgraph.yaml` from the template
- `subgraph.yaml` - Generated file (don't edit directly!)

### 2. Configuration Classes

The source code uses configuration classes defined in `src/config.ts`:

- `NetworkConfig` - Contract addresses, token addresses, pool IDs
- `TokenConfig` - Token metadata and helper functions
- `PoolConfig` - Pool-specific configuration and utilities

### 3. Build Process

All build commands automatically generate the correct configuration:

```bash
# Build for default network (base-sepolia)
npm run build

# Build for specific network
NETWORK=mainnet npm run build

# Generate config only
npm run build-config
```

## Adding New Networks

To add a new network:

1. Add the network configuration to `networks.json`:
```json
{
  "mainnet": {
    "contracts": {
      "PoolManager": {
        "address": "0x...",
        "startBlock": 12345
      },
      "AlphixHook": {
        "address": "0x...",
        "startBlock": 12346
      },
      "StateView": {
        "address": "0x..."
      }
    },
    "tokens": {
      // ... token definitions
    },
    "pools": {
      // ... pool definitions
    },
    "config": {
      "network": "mainnet",
      "targetHookId": "0x..."
    }
  }
}
```

2. Update `src/config.ts` if needed for network-specific logic

3. Build with the new network:
```bash
NETWORK=mainnet npm run build
```

## Benefits

- **Modularity**: Easy to switch between networks
- **Maintainability**: All addresses in one place
- **Extensibility**: Simple to add new networks
- **Type Safety**: Configuration helpers provide type safety
- **Automation**: Build process handles configuration generation

## Migration from Hardcoded Addresses

The following changes were made during migration:

1. **Moved hardcoded constants** from `src/pool-manager.ts` to `src/config.ts`
2. **Created configuration classes** for better organization
3. **Updated all references** to use configuration classes
4. **Created template system** for subgraph.yaml generation
5. **Updated build scripts** to handle configuration generation

## Environment Variables

- `NETWORK` - Target network (default: base-sepolia)

## Files Structure

```
├── networks.json              # Network configurations
├── subgraph.template.yaml     # Template for subgraph.yaml
├── subgraph.yaml             # Generated config (don't edit!)
├── src/
│   ├── config.ts             # Configuration classes
│   └── pool-manager.ts       # Updated to use config
├── scripts/
│   └── build-subgraph.js     # Build script
└── CONFIG.md                 # This documentation
``` 