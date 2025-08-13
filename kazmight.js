
require('dotenv').config();

const { ethers } = require('ethers');
const moment = require('moment');
const { CryptoBotUI } = require('./crypto-bot-ui');


const RPC_URL = process.env.RPC_URL || 'https://finney.uomi.ai/';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('Harap isi PRIVATE_KEY di .env');
  process.exit(1);
}

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);


const WUOMI = '0x5FCa78E132dF589c1c799F906dC867124a2567b2';
const USDC  = '0xAA9C4829415BCe70c434b7349b628017C59EC2b1';
const SYN   = '0x2922B2Ca5EB6b02fc5E1EBE57Fc1972eBB99F7e0';
const SIM   = '0x04B03e3859A25040E373cC9E8806d79596D70686';

const EXECUTE_ROUTER  = '0x197EEAd5Fe3DB82c4Cd55C5752Bc87AEdE11f230';
const POSITION_ROUTER = '0x906515Dc7c32ab887C8B8Dce6463ac3a7816Af38';
const QUOTER_ROUTER   = '0xCcB2B2F8395e4462d28703469F84c95293845332';

const EXPLORER = 'https://explorer.uomi.ai';


const FEE_3000 = 3000;
const MAX_PRIORITY_GWEI = '28.54';
const WRAP_AMOUNT_ETH = '0.01';
const MIN_SWAP = 0.001;
const MAX_SWAP = 0.003;
const AMT_WUOMI = 0.002;
const AMT_SYN   = 0.002;
const AMT_SIM   = 0.002;
const SWAP_SLIPPAGE_BPS = 50;  
const LP_SLIPPAGE_BPS   = 100; 


const ERC20_ABI = [
  {"type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"address","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},
  {"type":"function","name":"decimals","stateMutability":"view","inputs":[],"outputs":[{"name":"","type":"uint8"}]},
  {"type":"function","name":"allowance","stateMutability":"view","inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},
  {"type":"function","name":"approve","stateMutability":"nonpayable","inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]},
  {"type":"function","name":"deposit","stateMutability":"payable","inputs":[],"outputs":[]},
  {"type":"function","name":"withdraw","stateMutability":"nonpayable","inputs":[{"name":"wad","type":"uint256"}],"outputs":[]}
];

const ROUTER_ABI = [
  { "type":"function","name":"quoteExactInput","stateMutability":"nonpayable",
    "inputs":[{"internalType":"bytes","name":"path","type":"bytes"},{"internalType":"uint256","name":"amountIn","type":"uint256"}],
    "outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"}] },
  { "type":"function","name":"execute","stateMutability":"payable",
    "inputs":[{"internalType":"bytes","name":"commands","type":"bytes"},{"internalType":"bytes[]","name":"inputs","type":"bytes[]"},{"internalType":"uint256","name":"deadline","type":"uint256"}],
    "outputs":[] },
  { "type":"function","name":"multicall","stateMutability":"payable",
    "inputs":[{"internalType":"bytes[]","name":"data","type":"bytes[]"}],
    "outputs":[{"internalType":"bytes[]","name":"results","type":"bytes[]"}] },
  { "type":"function","name":"mint","stateMutability":"nonpayable",
    "inputs":[{ "type":"tuple","name":"params","internalType":"struct INonfungiblePositionManager.MintParams",
      "components":[
        {"internalType":"address","name":"token0","type":"address"},
        {"internalType":"address","name":"token1","type":"address"},
        {"internalType":"uint24","name":"fee","type":"uint24"},
        {"internalType":"int24","name":"tickLower","type":"int24"},
        {"internalType":"int24","name":"tickUpper","type":"int24"},
        {"internalType":"uint256","name":"amount0Desired","type":"uint256"},
        {"internalType":"uint256","name":"amount1Desired","type":"uint256"},
        {"internalType":"uint256","name":"amount0Min","type":"uint256"},
        {"internalType":"uint256","name":"amount1Min","type":"uint256"},
        {"internalType":"address","name":"recipient","type":"address"},
        {"internalType":"uint256","name":"deadline","type":"uint256"}
      ]}],
    "outputs":[
      {"internalType":"uint256","name":"tokenId","type":"uint256"},
      {"internalType":"uint128","name":"liquidity","type":"uint128"},
      {"internalType":"uint256","name":"amount0","type":"uint256"},
      {"internalType":"uint256","name":"amount1","type":"uint256"}] }
];


const wUOMI = new ethers.Contract(WUOMI, ERC20_ABI, wallet);
const execRouter = new ethers.Contract(EXECUTE_ROUTER, ROUTER_ABI, wallet);
const posRouter  = new ethers.Contract(POSITION_ROUTER, ROUTER_ABI, wallet);
const quoter     = new ethers.Contract(QUOTER_ROUTER, ROUTER_ABI, wallet);


const parseGwei   = (g) => ethers.utils.parseUnits(g, 'gwei');
const toWei18     = (v) => ethers.utils.parseUnits(String(v), 18);
const formatUnits = (v, d=18) => ethers.utils.formatUnits(v, d);
const formatEth   = (v) => ethers.utils.formatEther(v);
const MaxUint256  = ethers.constants.MaxUint256;
const abi         = ethers.utils.defaultAbiCoder;
const now = () => Math.floor(Date.now()/1000);
const deadline = (sec=600) => now() + sec;

async function feeOverrides() {

  return {
    maxPriorityFeePerGas: parseGwei(MAX_PRIORITY_GWEI),
    maxFeePerGas: parseGwei(MAX_PRIORITY_GWEI),
  };
}

function buildV3Path(tokenIn, tokenOut, fee=FEE_3000) {
  const inHex  = tokenIn.replace(/^0x/,'');
  const outHex = tokenOut.replace(/^0x/,'');
  const feeHex = ethers.utils.hexZeroPad(ethers.utils.hexlify(fee), 3).replace(/^0x/, '');
  return '0x' + inHex + feeHex + outHex;
}

function bpsMin(amountBN, bps) {
  return amountBN.mul(10000 - bps).div(10000);
}


function sortTokens(a, b) {
  return (a.toLowerCase() < b.toLowerCase()) ? [a, b] : [b, a];
}
const isWUOMI = (addr) => addr.toLowerCase() === WUOMI.toLowerCase();


const ui = new CryptoBotUI({
  title: 'UOMI • TESTNET',
  nativeSymbol: 'UOMI',
  bannerTexts: ['INVICTUSLABS', 'TESTNET', 'AUTOMATION'],
  tickerText: ' Join Telegram Channel : Invictuslabs - Airdrops ',
  tickerColor: '#00ffff',
  logFile: process.env.LOG_FILE || 'transactions.log', 
  mirrorConsole: false, 
  menuItems: [
    '1) Wrap 0.01 UOMI -> WUOMI',
    '2) Swap Random (WUOMI -> USDC/SYN/SIM)',
    '3) Add Liquidity Random',
    '4) Unwrap 0.01 WUOMI -> UOMI',
    '5) Exit'
  ],
  tokenColumns: 2
});


process.on('uncaughtException', (err) => {
  ui.log('error', `UncaughtException: ${err?.stack || err}`);
});
process.on('unhandledRejection', (reason) => {
  ui.log('error', `UnhandledRejection: ${reason?.stack || reason}`);
});
process.on('SIGINT', () => ui.destroy(0)); 


async function waitLog(tx) {
  ui.updateStats({ pendingTx: ui.pendingTx + 1 });
  ui.log('pending', `Waiting receipt: ${tx.hash}`);
  const rc = await tx.wait();
  ui.updateStats({
    pendingTx: Math.max(0, ui.pendingTx - 1),
    transactionCount: ui.transactionCount + 1
  });
  ui.log('success', `Block ${rc.blockNumber} | ${EXPLORER}/tx/${tx.hash}`);
  return rc;
}

async function ensureApprove(tokenAddr, spender, amount) {
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
  const owner = await wallet.getAddress();
  const allowance = await token.allowance(owner, spender);
  if (allowance.gte(amount)) return true;
  ui.log('gas', `Approve ${tokenAddr} -> ${spender}`);
  const tx = await token.approve(spender, MaxUint256, await feeOverrides());
  await waitLog(tx);
  return true;
}


async function actionWrap(amountEthStr=WRAP_AMOUNT_ETH) {
  try {
    ui.setActive(true);
    ui.log('info', `Wrap ${amountEthStr} UOMI -> WUOMI`);
    const tx = await wUOMI.deposit({ value: ethers.utils.parseEther(amountEthStr), ...(await feeOverrides()) });
    await waitLog(tx);
  } catch (e) {
    ui.updateStats({ failedTx: ui.failedTx + 1 });
    ui.log('error', `Wrap failed: ${String(e.message || e)}`);
  }
}

async function actionUnwrap(amountEthStr=WRAP_AMOUNT_ETH) {
  try {
    ui.setActive(true);
    ui.log('info', `Unwrap ${amountEthStr} WUOMI -> UOMI`);
    const tx = await wUOMI.withdraw(ethers.utils.parseEther(amountEthStr), await feeOverrides());
    await waitLog(tx);
  } catch (e) {
    ui.updateStats({ failedTx: ui.failedTx + 1 });
    ui.log('error', `Unwrap failed: ${String(e.message || e)}`);
  }
}

async function actionSwapRandom() {
  const pairs = [
    ['WUOMI->USDC', WUOMI, USDC],
    ['WUOMI->SYN',  WUOMI, SYN ],
    ['WUOMI->SIM',  WUOMI, SIM ],
  ];
  const pick = pairs[Math.floor(Math.random()*pairs.length)];
  const amountInFloat = +(Math.random()*(MAX_SWAP - MIN_SWAP) + MIN_SWAP).toFixed(6);
  const amountInWei = toWei18(amountInFloat);
  const path = buildV3Path(pick[1], pick[2], FEE_3000);

  try {
    ui.setActive(true);
    ui.log('swap', `Quote ${pick[0]} for ${amountInFloat}`);
    const quotedOut = await quoter.callStatic.quoteExactInput(path, amountInWei);
    if (quotedOut.isZero()) throw new Error('Quote = 0');
    const minOut = bpsMin(quotedOut, SWAP_SLIPPAGE_BPS);

    const commands = '0x0b00';
    const wrapInput = abi.encode(['address','uint256'], ['0x0000000000000000000000000000000000000002', amountInWei]);
    const swapInput = abi.encode(['address','uint256','uint256','bytes','bool'],
      ['0x0000000000000000000000000000000000000001', amountInWei, minOut, path, false]);

    ui.log('swap', `Execute ${pick[0]} amountIn=${amountInFloat}`);
    const tx = await execRouter.execute(commands, [wrapInput, swapInput], deadline(600), {
      value: amountInWei,
      ...(await feeOverrides())
    });
    await waitLog(tx);
  } catch (e) {
    ui.updateStats({ failedTx: ui.failedTx + 1 });
    ui.log('error', `Swap failed: ${String(e.message || e)}`);
  }
}

function encodeMintParams(params) {
  return abi.encode(
    ['address','address','uint24','int24','int24','uint256','uint256','uint256','uint256','address','uint256'],
    [params.token0, params.token1, params.fee, params.tickLower, params.tickUpper,
     params.amount0Desired, params.amount1Desired, params.amount0Min, params.amount1Min,
     params.recipient, params.deadline]
  );
}

async function actionAddLPRandom() {
  const options = [
    ['native','SYN/UOMI',  SYN,  WUOMI, toWei18(AMT_WUOMI)],
    ['native','SIM/UOMI',  SIM,  WUOMI, toWei18(AMT_WUOMI)],
    ['erc20','WUOMI/USDC', WUOMI,USDC,  toWei18(AMT_WUOMI)],
    ['erc20','SYN/WUOMI',  SYN,  WUOMI, toWei18(AMT_SYN)],
    ['erc20','SYN/USDC',   SYN,  USDC,  toWei18(AMT_SYN)],
    ['erc20','SIM/WUOMI',  SIM,  WUOMI, toWei18(AMT_SIM)],
    ['erc20','SIM/USDC',   SIM,  USDC,  toWei18(AMT_SIM)],
    ['erc20','SIM/SYN',    SIM,  SYN,   toWei18(AMT_SIM)],
  ];

  let [type,label,t0,t1,amt0] = options[Math.floor(Math.random()*options.length)];


  let [token0, token1] = sortTokens(t0, t1);

  const owner = await wallet.getAddress();
  const tickLower = -887220, tickUpper = 887220; 
  const dl = deadline(600);
  const amt1 = amt0; 


  const min0 = ethers.constants.Zero;
  const min1 = ethers.constants.Zero;

  try {
    ui.setActive(true);
    ui.log('liquidity', `Add LP ${label} (${type})`);

    if (type === 'native') {
      
      if (!isWUOMI(token0) && !isWUOMI(token1)) {
        ui.log('warning', 'Native path tanpa WUOMI; fallback ke ERC20 path');
        type = 'erc20';
      }
    }

    if (type === 'native') {
      
      const erc20Side = isWUOMI(token0) ? token1 : token0;
      await ensureApprove(erc20Side, POSITION_ROUTER, amt0);

      const mintSelector   = '0x88316456'; 
      const refundSelector = '0x12210e8a'; 

      const params = encodeMintParams({
        token0, token1, fee: FEE_3000, tickLower, tickUpper,
        amount0Desired: amt0, amount1Desired: amt1,
        amount0Min: min0, amount1Min: min1,
        recipient: owner, deadline: dl
      });

      const mintCalldata = mintSelector + params.slice(2);
      const valueToSend = isWUOMI(token0) ? amt0 : amt1;

      const tx = await posRouter.multicall([mintCalldata, refundSelector], {
        value: valueToSend,
        ...(await feeOverrides()),
        gasLimit: 1_000_000, 
      });
      await waitLog(tx);

    } else {
      
      await ensureApprove(token0, POSITION_ROUTER, amt0);
      await ensureApprove(token1, POSITION_ROUTER, amt1);

      const params = {
        token0, token1, fee: FEE_3000, tickLower, tickUpper,
        amount0Desired: amt0, amount1Desired: amt1,
        amount0Min: min0, amount1Min: min1,
        recipient: owner, deadline: dl
      };
      const tx = await posRouter.mint(params, { ...(await feeOverrides()), gasLimit: 1_000_000 });
      await waitLog(tx);
    }
  } catch (e) {
    ui.updateStats({ failedTx: ui.failedTx + 1 });
    ui.log('error', `Add LP failed: ${String(e.message || e)}`);
  }
}


ui.on('menu:select', async (label, index) => {
  const n = index + 1;
  try {
    if (n === 1) await actionWrap();
    else if (n === 2) await actionSwapRandom();
    else if (n === 3) await actionAddLPRandom();
    else if (n === 4) await actionUnwrap();
    else if (n === 5) ui.destroy(0);
  } catch (e) {
    ui.log('error', `Unhandled: ${String(e.message || e)}`);
  }
});


const TOKENS = [
  { name: 'Wrapped UOMI', symbol: 'WUOMI', address: WUOMI, decimals: 18 },
  { name: 'USD Coin',     symbol: 'USDC',  address: USDC,  decimals: 18 },
  { name: 'Syn',          symbol: 'SYN',   address: SYN,   decimals: 18 },
  { name: 'Sim',          symbol: 'SIM',   address: SIM,   decimals: 18 },
];

let refreshing = false;
async function refreshWalletAndTokens() {
  if (refreshing) return;
  refreshing = true;
  try {
    const addr = await wallet.getAddress();
    const [balWei, net, gasPrice, nonce] = await Promise.all([
      provider.getBalance(addr),
      provider.getNetwork(),
      provider.getGasPrice(),
      provider.getTransactionCount(addr)
    ]);
    const gasGwei = Number(ethers.utils.formatUnits(gasPrice, 'gwei')).toFixed(2);

    ui.updateWallet({
      address: addr,
      nativeBalance: Number(formatEth(balWei)).toFixed(6),
      network: `${net.name || 'uomi'} (chainId ${net.chainId})`,
      gasPrice: `${gasGwei}`,
      nonce: `${nonce}`
    });
    ui.updateStats({ currentGasPrice: gasGwei });

    const tokenBalances = [];
    for (let i=0;i<TOKENS.length;i++) {
      const t = TOKENS[i];
      const c = new ethers.Contract(t.address, ERC20_ABI, provider);
      const bal = await c.balanceOf(addr);
      tokenBalances.push({
        enabled: true,
        name: t.name, symbol: t.symbol,
        balance: Number(formatUnits(bal, t.decimals)).toFixed(6)
      });
    }
    ui.setTokens(tokenBalances);
  } catch (e) {
    ui.log('warning', `Refresh failed: ${String(e.message || e)}`);
  } finally {
    refreshing = false;
  }
}

setInterval(refreshWalletAndTokens, 5000);
refreshWalletAndTokens().catch(()=>{});


(async () => {
  ui.log('info', `RPC  : ${RPC_URL}`);
  ui.log('info', `Acct : ${(await wallet.getAddress()).slice(0,10)}…`);
  ui.log('info', `Time : ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
})();
