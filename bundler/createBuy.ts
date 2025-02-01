import {
    Commitment,
    Finality,
    Keypair,
    LAMPORTS_PER_SOL,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    Transaction,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
import {
    CreateTokenMetadata,
    PriorityFee,
} from "../src/types";
import {
    DEFAULT_COMMITMENT,
    DEFAULT_FINALITY,
    buildTx,
    getOrCreateKeypair,
    getRandomInt,
    sendTx,
    sleep,
} from "../src/util";
import { jitoWithAxios } from "../src/jitoWithAxios";
import { connection, TEST_MODE, sdk } from "../constants/constants"
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";

export const createAndBuy = async (
    creator: Keypair,
    mint: Keypair,
    buyers: Keypair[],
    createTokenMetadata: CreateTokenMetadata,
    buyAmountSol: bigint,
    slippageBasisPoints: bigint = 300n,
    priorityFees?: PriorityFee,
    commitment: Commitment = DEFAULT_COMMITMENT,
    finality: Finality = DEFAULT_FINALITY,
) => {

    let tokenMetadata = await sdk.createTokenMetadata(createTokenMetadata);

    let createTx = await sdk.getCreateInstructions(
        creator.publicKey,
        createTokenMetadata.name,
        createTokenMetadata.symbol,
        tokenMetadata.metadataUri,
        mint
    );

    let newTx = new Transaction().add(createTx);
    let buyTxs: VersionedTransaction[] = [];
    let createVersionedTx: VersionedTransaction

    try {

        createVersionedTx = await buildTx(
            connection,
            newTx,
            creator.publicKey,
            [creator, mint],
            priorityFees,
            commitment,
            finality
        );

   
        if (buyAmountSol > 0) {

            // let ixs: TransactionInstruction[] = []

            for (let i = 0; i < buyers.length; i++) {
                
                const randomPercent = getRandomInt(10, 25);
                const buyAmountSolWithRandom = buyAmountSol / BigInt(100) * BigInt(randomPercent % 2 ? (100 + randomPercent) : (100 - randomPercent))

            
                let buyTx = await sdk.getBuyInstructionsBySolAmount(
                    buyers[i].publicKey,
                    mint.publicKey,
                    buyAmountSolWithRandom,
                    slippageBasisPoints,
                    commitment
                );

                const buyVersionedTx = await buildTx(
                    connection,
                    buyTx,
                    buyers[i].publicKey,
                    [buyers[i]],
                    priorityFees,
                    commitment,
                    finality
                );
                console.log("Simulation about buy transactions", await connection.simulateTransaction(buyVersionedTx))

                buyTxs.push(buyVersionedTx);
            }
        
            console.log("-------- swap coin instructions [DONE] ---------\n")

        }
    } catch (err) {
        console.log("Error in create and buy: ", err)
        return false
    }

    let result;
    while (1) {
        console.log("Let's wait for a while for confirming the bundling transactions.")
        result = await jitoWithAxios([createVersionedTx, ...buyTxs], creator);
        if (result.confirmed) {
            console.log("Bundle fee signature: ", result.signature)
            break;
        }
        await sleep(20000)
    }
    return result;
}

const executeVersionedTx = async (transaction: VersionedTransaction) => {
    const latestBlockhash = await connection.getLatestBlockhash()
    const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true })

    const confirmation = await connection.confirmTransaction(
        {
            signature,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            blockhash: latestBlockhash.blockhash,
        }
    );

    if (confirmation.value.err) {
        console.log("Confirmation error")
        return ""
    } else {
        console.log(`Confirmed transaction: https://solscan.io/tx/${signature}`)
    }
    return signature
}

