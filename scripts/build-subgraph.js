#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Default to base-sepolia if no network is specified
const network = process.env.NETWORK || 'base-sepolia';

console.log(`Building subgraph for network: ${network}`);

try {
  // Read the networks configuration
  const networksPath = path.join(__dirname, '..', 'networks.json');
  const networks = JSON.parse(fs.readFileSync(networksPath, 'utf8'));

  // Check if the network exists in the configuration
  if (!networks[network]) {
    console.error(`Network "${network}" not found in networks.json`);
    console.error(`Available networks: ${Object.keys(networks).join(', ')}`);
    process.exit(1);
  }

  const networkConfig = networks[network];

  // Read the template file
  const templatePath = path.join(__dirname, '..', 'subgraph.template.yaml');
  let template = fs.readFileSync(templatePath, 'utf8');

  // Replace placeholders with actual values
  template = template
    .replace(/\{\{NETWORK\}\}/g, network)
    .replace(/\{\{POOL_MANAGER_ADDRESS\}\}/g, networkConfig.contracts.PoolManager.address)
    .replace(/\{\{POOL_MANAGER_START_BLOCK\}\}/g, networkConfig.contracts.PoolManager.startBlock)
    .replace(/\{\{ALPHIX_HOOK_ADDRESS\}\}/g, networkConfig.contracts.AlphixHook.address)
    .replace(/\{\{ALPHIX_HOOK_START_BLOCK\}\}/g, networkConfig.contracts.AlphixHook.startBlock);

  // Write the generated subgraph.yaml
  const outputPath = path.join(__dirname, '..', 'subgraph.yaml');
  fs.writeFileSync(outputPath, template);

  console.log(`✅ Generated subgraph.yaml for ${network}`);
  console.log(`   PoolManager: ${networkConfig.contracts.PoolManager.address}`);
  console.log(`   AlphixHook: ${networkConfig.contracts.AlphixHook.address}`);

} catch (error) {
  console.error('❌ Error building subgraph configuration:', error.message);
  process.exit(1);
} 