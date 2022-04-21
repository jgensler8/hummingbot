import { Ethereum } from '../chains/ethereum/ethereum';
import { Avalanche } from '../chains/avalanche/avalanche';
import { Harmony } from '../chains/harmony/harmony';
import { Uniswap } from '../connectors/uniswap/uniswap';
import { Pangolin } from '../connectors/pangolin/pangolin';
import { UniswapMinimal } from '../connectors/uniswap-minimal/uniswap-minimal';
import { Ethereumish } from './common-interfaces';

export async function getChain(chain: string, network: string) {
  let chainInstance: Ethereumish;
  if (chain === 'ethereum') chainInstance = Ethereum.getInstance(network);
  else if (chain === 'avalanche')
    chainInstance = Avalanche.getInstance(network);
  else if (chain === 'harmony') chainInstance = Harmony.getInstance(network);
  else throw new Error('unsupported chain');
  if (!chainInstance.ready()) {
    await chainInstance.init();
  }
  return chainInstance;
}

export async function getConnector(
  chain: string,
  network: string,
  connector: string | undefined
) {
  let connectorInstance: any;
  if (chain === 'ethereum' && connector === 'uniswap')
    connectorInstance = Uniswap.getInstance(chain, network);
  else if (chain === 'avalanche' && connector === 'pangolin')
    connectorInstance = Pangolin.getInstance(chain, network);
  else if (chain === 'harmony') {
    // console.log(connector)
    if(connector === 'sushiswap') {
      connectorInstance = UniswapMinimal.getInstance(chain, network, '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506')
    }
    else if (connector === 'viperswap') {
      connectorInstance = UniswapMinimal.getInstance(chain, network, '0xf012702a5f0e54015362cbca26a26fc90aa832a3')
    }
    else {
      throw new Error(`harmony supported but connector is ${connector} and should be either sushiswap or viperswap`)
    }
  }
  else throw new Error('unsupported chain or connector');
  if (!connectorInstance.ready()) {
    await connectorInstance.init();
  }
  return connectorInstance;
}
