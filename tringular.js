require('dotenv').config();
const { ethers } = require('ethers');

// Log the version of ethers being used
console.log(`Using ethers version: ${ethers.version}`);

// ==============================
// Configuration
// ==============================

// Connect to Ethereum node via Infura
const INFURA_URL = "https://1rpc.io/eth";
const provider = new ethers.JsonRpcProvider(INFURA_URL);

// Wallet details
const PRIVATE_KEY = "ee9cec01ff03c0adea731d7c5a84f7b412bfd062b9ff35126520b3eb3d5ff258";
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Uniswap v2 Router and Factory addresses
const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // Mainnet Uniswap Router
const UNISWAP_FACTORY_ADDRESS = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"; // Mainnet Uniswap Factory

// Token addresses
const TOKENS = [
    { name: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
    { name: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
    { name: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" },
    { name: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA" },
    { name: "UNI", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" },
    { name: "AAVE", address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9" },
    { name: "COMP", address: "0xc00e94Cb662C3520282E6f5717214004A7f26888" },
    { name: "SUSHI", address: "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2" },
    { name: "YFI", address: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e" },
    { name: "1INCH", address: "0x111111111117dC0aa78b770fA6A738034120C302" },
    { name: "SNX", address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F" },
    { name: "MKR", address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2" },
    { name: "BAT", address: "0x0D8775F648430679A709E98d2b0Cb6250d2887EF" },
    { name: "ZRX", address: "0xE41d2489571d322189246DaFA5ebDe1F4699F498" }
];

// ABI for Uniswap Router (simplified)
const UNISWAP_ROUTER_ABI = [
    "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];

// Initialize Uniswap Router contract
const uniswapRouter = new ethers.Contract(UNISWAP_ROUTER_ADDRESS, UNISWAP_ROUTER_ABI, wallet);

// Gas settings
const GAS_LIMIT = 300000;
const GAS_PRICE = ethers.parseUnits("50", "gwei"); // Adjust based on network congestion

// Arbitrage parameters
const MIN_PROFIT_THRESHOLD = ethers.parseEther("0.01"); // Minimum profit threshold in ETH

// ==============================
// Helper Functions
// ==============================

async function getTokenPrice(tokenIn, tokenOut, amountIn) {
    try {
        const path = [tokenIn, tokenOut];
        const amountsOut = await uniswapRouter.getAmountsOut(amountIn, path);
        return BigInt(amountsOut[1].toString()); // Convert to BigInt
    } catch (error) {
        console.error(`Error getting token price for ${tokenIn} to ${tokenOut}:`, error);
        return BigInt(0); // Return 0 if there's an error
    }
}

async function executeSwap(tokenIn, tokenOut, amountIn, minAmountOut) {
    const path = [tokenIn, tokenOut];
    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now

    try {
        const tx = await uniswapRouter.swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            path,
            wallet.address,
            deadline,
            { gasLimit: GAS_LIMIT, gasPrice: GAS_PRICE }
        );

        console.log(`Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();
        if (receipt.status) {
            console.log("Swap successful!");
        } else {
            console.log("Swap failed.");
        }
    } catch (error) {
        console.error(`Error executing swap for ${tokenIn} to ${tokenOut}:`, error);
    }
}

// ==============================
// Main Triangular Arbitrage Logic
// ==============================

async function checkTriangularArbitrage() {
    const amountIn = ethers.parseEther("1"); // Amount of token to trade

    for (let i = 0; i < TOKENS.length; i++) {
        for (let j = 0; j < TOKENS.length; j++) {
            for (let k = 0; k < TOKENS.length; k++) {
                if (i === j || j === k || k === i) continue; // Skip same token pairs

                const tokenA = TOKENS[i].address;
                const tokenB = TOKENS[j].address;
                const tokenC = TOKENS[k].address;

                // Get prices for tokenA -> tokenB, tokenB -> tokenC, and tokenC -> tokenA
                const priceAToB = await getTokenPrice(tokenA, tokenB, amountIn);
                const priceBToC = await getTokenPrice(tokenB, tokenC, priceAToB);
                const priceCToA = await getTokenPrice(tokenC, tokenA, priceBToC);

                // Log the prices for debugging
                console.log(`Price ${TOKENS[i].name} to ${TOKENS[j].name}: ${priceAToB.toString()}`);
                console.log(`Price ${TOKENS[j].name} to ${TOKENS[k].name}: ${priceBToC.toString()}`);
                console.log(`Price ${TOKENS[k].name} to ${TOKENS[i].name}: ${priceCToA.toString()}`);

                // Calculate profit (after converting back to tokenA)
                const profit = priceCToA - BigInt(amountIn.toString());

                if (profit > BigInt(MIN_PROFIT_THRESHOLD.toString())) {
                    console.log(`Triangular arbitrage opportunity found! Profit: ${ethers.formatEther(profit)} ETH`);
                    // Execute the arbitrage
                    const minAmountOutAToB = priceAToB * BigInt(98) / BigInt(100); // Allow 2% slippage
                    await executeSwap(tokenA, tokenB, amountIn, minAmountOutAToB);

                    const minAmountOutBToC = priceBToC * BigInt(98) / BigInt(100); // Allow 2% slippage
                    await executeSwap(tokenB, tokenC, priceAToB, minAmountOutBToC);

                    const minAmountOutCToA = priceCToA * BigInt(98) / BigInt(100); // Allow 2% slippage
                    await executeSwap(tokenC, tokenA, priceBToC, minAmountOutCToA);
                } else {
                    console.log(`No profitable triangular arbitrage opportunity found between ${TOKENS[i].name}, ${TOKENS[j].name}, and ${TOKENS[k].name}.`);
                }
            }
        }
    }
}

// ==============================
// Run the Bot
// ==============================

async function runBot() {
    while (true) {
        try {
            await checkTriangularArbitrage();
            await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10 seconds
        } catch (error) {
            console.error("An error occurred:", error);
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait before retrying
        }
    }
}

runBot();
