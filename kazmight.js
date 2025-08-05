require('dotenv').config();
const { ethers } = require('ethers');
const readlineSync = require('readline-sync');
const { performance } = require('perf_hooks');
const { BigNumber } = require('@ethersproject/bignumber');
const { Percent, CurrencyAmount, Token, TradeType } = require('@uniswap/sdk-core');
const { SwapRouter } = require('@uniswap/universal-router-sdk');

// --- Configuration ---
const RPC_URL = "https://finney.uomi.ai";
const CHAIN_ID = 4386;

// Alamat kontrak
const ROUTER_ADDRESS = "0x197EEAd5Fe3DB82c4Cd55C5752Bc87AEdE11f230";
const LIQUIDITY_MANAGER_ADDRESS = "0x906515Dc7c32ab887C8B8Dce6463ac3a7816Af38";

const TOKENS = {
    "SYN": "0x2922B2Ca5EB6b02fc5E1EBE57Fc1972eBB99F7e0",
    "SIM": "0x04B03e3859A25040E373cC9E8806d79596D70686",
    "USDC": "0xAA9C4829415BCe70c434b7349b628017C599EC2b1", 
    "DOGE": "0xb227C129334BC58Eb4d02477e77BfCCB5857D408",
    "SYN_TO_UOMI": "0x2922B2Ca5EB6b02fc5E1EBE57Fc1972eBB99F7e0",
    "SIM_TO_UOMI": "0x04B03e3859A25040E373cC9E8806d79596D70686",
    "USDC_TO_UOMI": "0xAA9C4829415BCe70c434b7349b628017C599EC2b1", 
    "DOGE_TO_UOMI": "0xb227C129334BC58Eb4d02477e77BfCCB5857D408",
    "UOMI_TO_WUOMI": "0x5FCa78E132dF589c1c799F906dC867124a2567b2",
    "WUOMI_TO_UOMI": "0x5FCa78E132dF589c1c799F906dC867124a2567b2"
};
const TOKEN_LIST = Object.entries(TOKENS);
const NATIVE_TOKEN = "UOMI"; 
const WETH_ADDRESS = "0x5FCa78E132dF589c1c799F906dC867124a2567b2";

const ROUTER_ABI = [
    "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
    "function execute(bytes commands, bytes[] inputs) payable"
];

const LIQUIDITY_MANAGER_ABI = [
    "function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
];

const TOKEN_ABI = [
    "function approve(address spender, uint256 value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

const colors = {
    reset: "\x1b[0m", cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", white: "\x1b[37m", bold: "\x1b[1m", blue: "\x1b[34m", magenta: "\x1b[35m",
};

const logger = {
    info: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[🛑] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[❌] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.cyan}[🔄] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.white}[🟢] ${msg}${colors.reset}`),
    countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),
};

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const PRIVATE_KEYS = [];
let i = 1;
while (true) {
    const key = process.env[`PRIVATE_KEYS_${i}`];
    if (!key) break;
    PRIVATE_KEYS.push(key.trim());
    i++;
}

if (PRIVATE_KEYS.length === 0) {
    logger.error("Tidak ada private key yang ditemukan di file .env (contoh: PRIVATE_KEYS_1).");
    process.exit(1);
}

// --- Utility Functions ---

async function countdown(seconds) {
    for (let i = seconds; i > 0; i--) {
        logger.countdown(`Menunggu ${i} detik sebelum transaksi berikutnya...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    process.stdout.write('\r' + ' '.repeat(process.stdout.columns) + '\r');
}

async function getBalance(signer, tokenAddress) {
    const walletAddress = await signer.getAddress();
    if (tokenAddress === NATIVE_TOKEN) {
        const balance = await provider.getBalance(walletAddress);
        return { balance, decimals: 18 };
    }
    const tokenContract = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
    try {
        const balance = await tokenContract.balanceOf(walletAddress);
        const decimals = await tokenContract.decimals();
        return { balance, decimals };
    } catch (error) {
        return { balance: ethers.BigNumber.from(0), decimals: 18 };
    }
}

async function doSwap(signer, tokenName, tokenAddr, isTokenToUomi, percentage) {
    const walletAddress = await signer.getAddress();
    
    let fromTokenAddress = isTokenToUomi ? tokenAddr : NATIVE_TOKEN;
    let fromTokenName = isTokenToUomi ? tokenName.split('_TO_')[0] : NATIVE_TOKEN;
    
    if (fromTokenName === NATIVE_TOKEN && tokenName === "UOMI_TO_WUOMI") {
        fromTokenAddress = NATIVE_TOKEN;
        fromTokenName = NATIVE_TOKEN;
    }

    logger.step(`[Akun ${walletAddress.slice(0, 6)}...] Memulai swap...`);
    logger.loading(`Mendapatkan balance untuk token ${fromTokenName}...`);
    
    let { balance, decimals } = await getBalance(signer, fromTokenAddress);
    
    const amountToSwap = balance.mul(ethers.BigNumber.from(Math.floor(percentage * 100))).div(ethers.BigNumber.from(10000));

    if (amountToSwap.isZero()) {
        logger.warn(`Jumlah swap 0. Pastikan Anda memiliki saldo ${fromTokenName}. Melewati...`);
        return;
    }

    const amountDisplay = ethers.utils.formatUnits(amountToSwap, decimals);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    if (tokenName === "UOMI_TO_WUOMI") {
        logger.step(`Memulai Swap: ${amountDisplay} ${NATIVE_TOKEN} -> WUOMI`);
        try {
            const tx = await signer.sendTransaction({
                chainId: CHAIN_ID,
                to: tokenAddr,
                value: amountToSwap,
                data: "0xd0e30db0", 
                gasLimit: 42242,
                maxFeePerGas: (await provider.getBlock("latest")).baseFeePerGas.add(ethers.utils.parseUnits('2', 'gwei')),
                maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
            });

            logger.info(`TX SENT: https://explorer.uomi.ai/tx/${tx.hash}`);
            await tx.wait();
            logger.success('SWAP SELESAI');
        } catch (error) {
            logger.error(`SWAP GAGAL: ${error.message.slice(0, 50)}...`);
            logger.warn("Penyebab paling umum adalah: saldo tidak cukup atau data swap tidak valid.");
        }
        return;
    }

    const routerContract = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);

    if (isTokenToUomi) {
        logger.step(`Memulai Swap: ${amountDisplay} ${fromTokenName} -> ${NATIVE_TOKEN}`);
        
        try {
            const tokenContract = new ethers.Contract(tokenAddr, TOKEN_ABI, signer);
            logger.loading("Menyetujui Token...");
            const approveTx = await tokenContract.approve(ROUTER_ADDRESS, amountToSwap, {
                gasLimit: 100000,
                maxFeePerGas: (await provider.getBlock("latest")).baseFeePerGas.add(ethers.utils.parseUnits('2', 'gwei')),
                maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
            });
            await approveTx.wait();
            logger.success(`DISETUJUI: https://explorer.uomi.ai/tx/${approveTx.hash}`);
        } catch (error) {
            logger.error(`PERSETUJUAN GAGAL: ${error.message.slice(0, 50)}...`);
            return;
        }

        // --- PENTING: GANTI DENGAN LOGIKA DARI SDK ROUTER ---
        const commands = "0x..."; 
        const inputs = ["0x..."]; 
        
        logger.loading("Menjalankan Swap...");
        try {
            const tx = await routerContract.execute(commands, inputs, deadline, {
                value: 0,
                gasLimit: 300000,
                maxFeePerGas: (await provider.getBlock("latest")).baseFeePerGas.add(ethers.utils.parseUnits('2', 'gwei')),
                maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
            });
            logger.info(`TX SENT: https://explorer.uomi.ai/tx/${tx.hash}`);
            await tx.wait();
            logger.success('SWAP SELESAI');
        } catch (error) {
            logger.error(`SWAP GAGAL: ${error.message.slice(0, 50)}...`);
            logger.warn("Penyebab paling umum adalah: saldo tidak cukup atau data swap tidak valid. Periksa kembali ABI dan dokumentasi router.");
        }
    } else { 
        logger.step(`Memulai Swap: ${amountDisplay} ${NATIVE_TOKEN} -> ${tokenName}`);
        
        const commands = "0x..."; 
        const inputs = ["0x..."]; 

        logger.loading("Menjalankan Swap...");
        try {
            const tx = await routerContract.execute(commands, inputs, deadline, {
                value: amountToSwap, 
                gasLimit: 300000,
                maxFeePerGas: (await provider.getBlock("latest")).baseFeePerGas.add(ethers.utils.parseUnits('2', 'gwei')),
                maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
            });
            logger.info(`TX SENT: https://explorer.uomi.ai/tx/${tx.hash}`);
            await tx.wait();
            logger.success('SWAP SELESAI');
        } catch (error) {
            logger.error(`SWAP GAGAL: ${error.message.slice(0, 50)}...`);
            logger.warn("Penyebab paling umum adalah: saldo tidak cukup atau data swap tidak valid. Periksa kembali ABI dan dokumentasi router.");
        }
    }
}

async function addLiquidity(signer, token0Name, token1Name, amount0Percentage, amount1Percentage) {
    const walletAddress = await signer.getAddress();
    const token0Addr = TOKENS[token0Name] || WETH_ADDRESS;
    const token1Addr = TOKENS[token1Name] || WETH_ADDRESS;
    
    const token0IsNative = token0Name === NATIVE_TOKEN;
    const token1IsNative = token1Name === NATIVE_TOKEN;

    logger.step(`[Akun ${walletAddress.slice(0, 6)}...] Memulai Add Liquidity: ${token0Name} / ${token1Name}`);
    
    const { balance: balance0, decimals: decimals0 } = await getBalance(signer, token0IsNative ? NATIVE_TOKEN : token0Addr);
    const { balance: balance1, decimals: decimals1 } = await getBalance(signer, token1IsNative ? NATIVE_TOKEN : token1Addr);

    const amount0Desired = balance0.mul(ethers.BigNumber.from(Math.floor(amount0Percentage * 100))).div(ethers.BigNumber.from(10000));
    const amount1Desired = balance1.mul(ethers.BigNumber.from(Math.floor(amount1Percentage * 100))).div(ethers.BigNumber.from(10000));

    if (amount0Desired.isZero() || amount1Desired.isZero()) {
        logger.warn("Jumlah likuiditas yang diinginkan 0. Pastikan Anda memiliki saldo yang cukup. Melewati...");
        return;
    }

    const amount0Display = ethers.utils.formatUnits(amount0Desired, decimals0);
    const amount1Display = ethers.utils.formatUnits(amount1Desired, decimals1);
    
    logger.step(`Menambahkan likuiditas: ${amount0Display} ${token0Name} dan ${amount1Display} ${token1Name}`);
    
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    
    const params = {
        token0: token0IsNative ? WETH_ADDRESS : token0Addr,
        token1: token1IsNative ? WETH_ADDRESS : token1Addr,
        fee: 3000,
        tickLower: -887272,
        tickUpper: 887272,
        amount0Desired: amount0Desired,
        amount1Desired: amount1Desired,
        amount0Min: 0,
        amount1Min: 0,
        recipient: walletAddress,
        deadline: deadline
    };

    let valueToSend = ethers.BigNumber.from(0);
    if (token0IsNative) {
        valueToSend = valueToSend.add(amount0Desired);
    }
    if (token1IsNative) {
        valueToSend = valueToSend.add(amount1Desired);
    }

    try {
        if (!token0IsNative) {
            const token0Contract = new ethers.Contract(token0Addr, TOKEN_ABI, signer);
            logger.loading(`Menyetujui token ${token0Name}...`);
            await token0Contract.approve(LIQUIDITY_MANAGER_ADDRESS, amount0Desired).then(tx => tx.wait());
            logger.success(`Persetujuan ${token0Name} berhasil.`);
        }
        if (!token1IsNative) {
            const token1Contract = new ethers.Contract(token1Addr, TOKEN_ABI, signer);
            logger.loading(`Menyetujui token ${token1Name}...`);
            await token1Contract.approve(LIQUIDITY_MANAGER_ADDRESS, amount1Desired).then(tx => tx.wait());
            logger.success(`Persetujuan ${token1Name} berhasil.`);
        }
    } catch (error) {
        logger.error(`PERSETUJUAN GAGAL: ${error.message.slice(0, 50)}...`);
        return;
    }

    const liquidityManagerContract = new ethers.Contract(LIQUIDITY_MANAGER_ADDRESS, LIQUIDITY_MANAGER_ABI, signer);

    try {
        logger.loading("Menjalankan transaksi mint...");
        const tx = await liquidityManagerContract.mint(params, {
            value: valueToSend,
            gasLimit: 500000,
            maxFeePerGas: (await provider.getBlock("latest")).baseFeePerGas.add(ethers.utils.parseUnits('2', 'gwei')),
            maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
        });

        logger.info(`TX SENT: https://explorer.uomi.ai/tx/${tx.hash}`);
        await tx.wait();
        logger.success("ADD LIQUIDITY SELESAI");
    } catch (error) {
        logger.error(`ADD LIQUIDITY GAGAL: ${error.message.slice(0, 50)}...`);
        logger.warn("Penyebab umum: saldo tidak cukup, rentang tick tidak valid, atau pool belum dibuat.");
    }
}

async function displayBalances() {
    console.log(`\n${colors.blue}─${colors.reset}`);
    for (const key of PRIVATE_KEYS) {
        const signer = new ethers.Wallet(key, provider);
        const walletAddress = await signer.getAddress();
        console.log(`${colors.white}Saldo Akun: ${walletAddress}${colors.reset}`);
        
        const { balance: uomiBalance, decimals: uomiDecimals } = await getBalance(signer, NATIVE_TOKEN);
        console.log(`  ${colors.white}- ${NATIVE_TOKEN}: ${colors.yellow}${ethers.utils.formatUnits(uomiBalance, uomiDecimals)}${colors.reset}`);

        const erc20Tokens = Object.keys(TOKENS).filter(name => !name.includes("UOMI"));
        for (const tokenName of erc20Tokens) {
            const tokenAddr = TOKENS[tokenName];
            const { balance, decimals } = await getBalance(signer, tokenAddr);
            console.log(`  ${colors.white}- ${tokenName}: ${colors.yellow}${ethers.utils.formatUnits(balance, decimals)}${colors.reset}`);
        }
        console.log(`${colors.blue}─${colors.reset}`);
    }
}

async function main() {
    const terminalWidth = process.stdout.columns || 80;

    const title = "UOMI DEX Multi-Account Auto Script";
    const version = "Version 1.2";
    const credit = "LETS FUCK THIS TESTNET--Created By Kazuha";

    console.log(`\n${colors.magenta}${colors.bold}${title.padStart(Math.floor((terminalWidth + title.length) / 2))}${colors.reset}`);
    console.log(`${colors.magenta}${colors.bold}${version.padStart(Math.floor((terminalWidth + version.length) / 2))}${colors.reset}`);
    console.log(`${colors.yellow}${colors.bold}${credit.padStart(Math.floor((terminalWidth + credit.length) / 2))}${colors.reset}`);
    console.log(`${colors.blue}${'─'.repeat(terminalWidth)}${colors.reset}`);

    await displayBalances();

    while (true) {
        console.log(`\n${colors.white}${colors.bold}Pilih Opsi:${colors.reset}`);
        console.log(`${colors.white}[1] Swap Manual${colors.reset}`);
        console.log(`${colors.white}[2] Swap Acak (Random)${colors.reset}`);
        console.log(`${colors.white}[3] Add Liquidity${colors.reset}`);
        console.log(`${colors.white}[0] Keluar${colors.reset}`);
        const choice = readlineSync.question(`${colors.cyan}>> Masukkan pilihan Anda: ${colors.reset}`);

        if (choice === '0') {
            logger.info("Keluar dari skrip.");
            break;
        }

        let numActions = 0;
        let percentage = 0;
        let delayInSeconds = 0;
        let tokenName, tokenAddr, isTokenToUomi;
        let selectedTokens = [];

        if (choice === '1' || choice === '2') {
            if (choice === '1') {
                console.log(`\n${colors.white}${colors.bold}Pilih Pasangan Swap Manual:${colors.reset}`);
                TOKEN_LIST.forEach(([name], index) => {
                    const tokenSymbol = name.endsWith("_TO_UOMI") ? name.split('_TO_')[0] : name;
                    const direction = name.includes("_TO_UOMI") ? "-> UOMI" : (name === "UOMI_TO_WUOMI" ? "-> WUOMI" : "UOMI ->");
                    console.log(`${colors.white}[${index + 1}] ${tokenSymbol} ${direction}${colors.reset}`);
                });
                const manualChoice = readlineSync.question(`${colors.cyan}>> Masukkan nomor pilihan Anda: ${colors.reset}`);
                const index = parseInt(manualChoice) - 1;
                
                if (index >= 0 && index < TOKEN_LIST.length) {
                    tokenName = TOKEN_LIST[index][0];
                    tokenAddr = TOKEN_LIST[index][1];
                    isTokenToUomi = tokenName.endsWith("_TO_UOMI");
                    selectedTokens.push([tokenName, tokenAddr, isTokenToUomi]);
                } else {
                    logger.error("Pilihan tidak valid.");
                    continue;
                }
            }
            
            percentage = readlineSync.question(`${colors.cyan}>> Masukkan persentase token untuk di-swap (contoh: 1%): ${colors.reset}`);
            percentage = parseFloat(percentage);
            numActions = readlineSync.question(`${colors.cyan}>> Berapa kali transaksi ingin dijalankan?: ${colors.reset}`);
            numActions = parseInt(numActions);

        } else if (choice === '3') {
            console.log(`\n${colors.white}${colors.bold}Pilih Pasangan Add Liquidity:${colors.reset}`);
            const uniqueTokens = [...new Set(Object.keys(TOKENS).map(name => name.split('_TO_')[0]))];
            
            console.log(`  ${colors.white}Token Native: UOMI${colors.reset}`);
            uniqueTokens.forEach((name, index) => {
                if (name !== NATIVE_TOKEN) {
                    console.log(`  ${colors.white}[${index + 1}] UOMI/${name}${colors.reset}`);
                }
            });

            const manualChoice = readlineSync.question(`${colors.cyan}>> Masukkan nomor pilihan Anda: ${colors.reset}`);
            const index = parseInt(manualChoice) - 1;

            if (index >= 0 && index < uniqueTokens.length) {
                const token0Name = NATIVE_TOKEN;
                const token1Name = uniqueTokens[index];
                selectedTokens.push([token0Name, token1Name]);
            } else {
                logger.error("Pilihan tidak valid.");
                continue;
            }

            percentage = readlineSync.question(`${colors.cyan}>> Masukkan persentase UOMI dan token untuk likuiditas (contoh: 50%): ${colors.reset}`);
            percentage = parseFloat(percentage);
            numActions = readlineSync.question(`${colors.cyan}>> Berapa kali transaksi ingin dijalankan?: ${colors.reset}`);
            numActions = parseInt(numActions);
        } else {
            logger.error("Pilihan tidak valid.");
            continue;
        }

        delayInSeconds = readlineSync.question(`${colors.cyan}>> Masukkan delay antar transaksi dalam detik: ${colors.reset}`);
        delayInSeconds = parseInt(delayInSeconds);

        if (isNaN(numActions) || isNaN(percentage) || isNaN(delayInSeconds) || numActions <= 0 || percentage <= 0 || delayInSeconds < 0) {
            logger.error("Input tidak valid. Pastikan semua input adalah angka positif.");
            continue;
        }

        console.log(`\n${colors.blue}${'─'.repeat(terminalWidth)}${colors.reset}`);
        for (const key of PRIVATE_KEYS) {
            const signer = new ethers.Wallet(key, provider);
            const walletAddress = await signer.getAddress();
            logger.step(`\nMemproses Akun: ${walletAddress}`);
            
            for (let j = 0; j < numActions; j++) {
                if (choice === '1' || choice === '2') {
                    if (choice === '2') {
                        const randomIndex = Math.floor(Math.random() * TOKEN_LIST.length);
                        [tokenName, tokenAddr] = TOKEN_LIST[randomIndex];
                        isTokenToUomi = tokenName.endsWith("_TO_UOMI");
                    } else {
                        [tokenName, tokenAddr, isTokenToUomi] = selectedTokens[0];
                    }
                    logger.loading(`[Transaksi ${j+1}/${numActions}] Memproses pasangan: ${tokenName}`);
                    await doSwap(signer, tokenName, tokenAddr, isTokenToUomi, percentage);
                } else if (choice === '3') {
                    const [token0Name, token1Name] = selectedTokens[0];
                    logger.loading(`[Transaksi ${j+1}/${numActions}] Memproses likuiditas: ${token0Name}/${token1Name}`);
                    await addLiquidity(signer, token0Name, token1Name, percentage, percentage);
                }

                if (j < numActions - 1) {
                    await countdown(delayInSeconds);
                }
            }
        }
        console.log(`\n${colors.blue}${'─'.repeat(terminalWidth)}${colors.reset}`);
        logger.success(`SELESAI. Semua transaksi untuk semua akun telah dijalankan.`);
    }
}

main().catch(console.error);
