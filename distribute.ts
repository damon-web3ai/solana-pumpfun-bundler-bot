import { Keypair, PublicKey } from "@solana/web3.js";
// import { distributeWalletNum, swapWallets } from "../settings"
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from 'bs58'
import { Data, getOrCreateKeypair, newSendToken, readBuyerWallet, retrieveEnvVariable, saveHolderWalletsToFile, sleep } from "./utils";
import { connection } from "./constants/constants";
const KEYS_FOLDER = __dirname + "/.keys";

const distributeWalletNum = Number(retrieveEnvVariable("DISTRIBUTION_WALLET_COUNT"))

const walletNum = distributeWalletNum
const mint = getOrCreateKeypair(KEYS_FOLDER, "mint");

const buyer1 = readBuyerWallet("buyer1");
const buyer2 = readBuyerWallet("buyer2");
const buyer3 = readBuyerWallet("buyer3");
const buyersString: string[] = [buyer1!, buyer2!, buyer3!]
const buyers: Keypair[] = buyersString.map((PK, i) => Keypair.fromSecretKey(bs58.decode(PK)))

const wallet_distribute = async () => {
    const walletData: Data[] = []
    console.log(`Create ${distributeWalletNum} Wallets & Distribute`);

    const swapWallets = buyers

    let wallets: { subWallets: String[], numTokens: number[] }[] = []
    swapWallets.forEach(async (swapWallet, i) => {
        try {
            await sleep(i * 2000)
            // console.log("🚀 ~ wallet_distribute= ~ swapWallet:", swapWallet.publicKey)
            const tokenAta = getAssociatedTokenAddressSync(mint.publicKey, swapWallet.publicKey)
            // console.log("🚀 ~ wallet_distribute= ~ tokenAta:", tokenAta)
            const tokenBal = (await connection.getTokenAccountBalance(tokenAta)).value.uiAmount
            const tokenDecimal = (await connection.getTokenAccountBalance(tokenAta)).value.decimals
            // console.log("🚀 ~ wallet_distribute= ~ tokenBal:", tokenBal)

            const avgTokenNum = tokenBal! / walletNum
            // console.log("🚀 ~ wallet_distribute= ~ avgTokenNum:", avgTokenNum)
            let subWallet: Keypair[] = []
            let subWalletPk: string[] = []

            let numTokenArray = generateDistribution(tokenBal!, Math.floor(avgTokenNum / 2), avgTokenNum * 2, walletNum, 'even')
            for (let i = 0; i < walletNum; i++) {
                const eachKey = Keypair.generate()
                // console.log("🚀 ~ wallet_distribute= ~ eachKey:", eachKey.publicKey)

                // have to adjust the number of token
                subWallet.push(eachKey)
                subWalletPk.push(bs58.encode(eachKey.secretKey))
            }
            wallets.push({
                subWallets: subWalletPk,
                numTokens: numTokenArray
            })
            subWalletPk.map((wallet) => {
                walletData.push({
                    privateKey: wallet,
                    pubkey: (Keypair.fromSecretKey(bs58.decode(wallet)).publicKey).toBase58()
                })
            })
            console.log("It is saving holder wallets.")
            saveHolderWalletsToFile(
                walletData
            )

            console.log("It is sending tokens to holder wallets.")
            await newSendToken(subWallet, numTokenArray, swapWallet, mint.publicKey, tokenDecimal)
            await sleep(10000)
        } catch (error) { console.log(error) }
    })
    console.log("🚀 ~ distribute= wallets: ", wallets)
    await sleep(50000)
}

export function generateDistribution(
    totalValue: number,
    minValue: number,
    maxValue: number,
    num: number,
    mode: string,
): number[] {
    if (mode == "even") {
        let element = totalValue / num;
        let array: number[] = [];
        for (let i = 0; i < num; i++)
            array.push(element);
        return array
    }
    // Early checks for impossible scenarios
    if (num * minValue > totalValue || num * maxValue < totalValue) {
        console.log("🚀 ~ totalValue:", totalValue)
        console.log("🚀 ~ maxValue:", maxValue)
        console.log("🚀 ~ minValue:", minValue)
        console.log("🚀 ~ num:", num)
        throw new Error('Impossible to satisfy the constraints with the given values.');
    }
    // Start with an evenly distributed array
    let distribution: number[] = new Array(num).fill(minValue);
    let currentTotal: number = minValue * num;
    // Randomly add to each to reach totalValue
    // ensuring values stay within minValue and maxValue
    for (let i = 0; currentTotal < totalValue && i < 10000; i++) {
        for (let j = 0; j < num; j++) {
            // Calculate remaining space to ensure constraints are not broken
            const spaceLeft = Math.min(totalValue - currentTotal, maxValue - distribution[j]);
            if (spaceLeft <= 0) continue;
            // Randomly decide how much to add within the space left
            const addValue = Math.floor(Math.random() * (spaceLeft + 1));
            distribution[j] += addValue;
            currentTotal += addValue;
            // Break early if the target is reached
            if (currentTotal === totalValue) break;
        }
    }
    // In cases where distribution cannot reach totalValue due to rounding, adjust the last element
    // This is safe due to the initial constraints check ensuring a solution exists
    if (currentTotal !== totalValue) {
        const difference = totalValue - currentTotal;
        for (let i = distribution.length - 1; i >= 0; i--) {
            const potentialValue = distribution[i] + difference;
            if (potentialValue <= maxValue) {
                distribution[i] += difference;
                break;
            }
        }
    }
    return distribution;
}

wallet_distribute()