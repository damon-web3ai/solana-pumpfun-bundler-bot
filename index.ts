import fs, { openAsBlob } from "fs";
import { ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import {
  execute,
  getOrCreateKeypair,
  getSPLBalance,
  printSOLBalance,
  printSPLBalance,
  readBuyerWallet,
  retrieveEnvVariable,
} from "./utils/util";
import metadata from "./utils/metadata";
import { getUploadedMetadataURI } from "./utils/uploadToIpfs";
import bs58 from "bs58";
import { createAndBuy } from "./bundler/createBuy";
import { connection, SLIPPAGE_BASIS_POINTS, SWAPSOLAMOUNT } from "./constants/constants";
import { PumpFunSDK } from "./utils";
import { AnchorProvider } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
const KEYS_FOLDER = __dirname + "/.keys";
const distributeWalletNum = Number(retrieveEnvVariable("DISTRIBUTION_WALLET_COUNT"))

const wallet = new NodeWallet(new Keypair()); //note this is not used
const provider = new AnchorProvider(connection, wallet, {
  commitment: "finalized",
});
const sdk = new PumpFunSDK(provider);

async function createMint() {

  // Generate a new keypair
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey;
  const secretKey = keypair.secretKey;
  const publicKeyBase58 = publicKey.toBase58();
  const secretKeyBase58 = bs58.encode(secretKey);

  const data = {
    "publicKey": publicKeyBase58,
    "secretKey": secretKeyBase58
  }
  const metadataString = JSON.stringify(data);
  const bufferContent = Buffer.from(metadataString, 'utf-8');
  fs.writeFileSync("./.keys/mint.json", bufferContent);

  return keypair; // Return the keypair object if needed
}

const main = async () => {

  const buyer1 = readBuyerWallet("buyer1");
  const buyer2 = readBuyerWallet("buyer2");
  const buyer3 = readBuyerWallet("buyer3");
  const buyersString: string[] = [buyer1!, buyer2!, buyer3!]
  const buyers: Keypair[] = buyersString.map((PK, i) => Keypair.fromSecretKey(bs58.decode(PK)))

  await createMint();

  const swapSolAmount = SWAPSOLAMOUNT
  const mainWallet = getOrCreateKeypair(KEYS_FOLDER, "devWallet");
  const mint = getOrCreateKeypair(KEYS_FOLDER, "mint");

  await distributeSol(buyers, swapSolAmount + 0.005 * distributeWalletNum, mainWallet)

  await printSOLBalance(
    connection,
    mainWallet.publicKey,
    "Pool creator keypair"
  );

  let globalAccount = await sdk.getGlobalAccount();
  // console.log(globalAccount);

  let currentSolBalance = await connection.getBalance(mainWallet.publicKey);
  if (currentSolBalance == 0) {
    console.log(
      "Please send some SOL to the creator wallet: ",
      mainWallet.publicKey.toBase58()
    );
    return;
  }

  buyers.map(async (buyer, i) => {
    await printSOLBalance(
      connection,
      buyer.publicKey,
      `Bundle Buyer ${i + 1} keypair`
    );
  })

  //Check if mint already exists
  let boundingCurveAccount = await sdk.getBondingCurveAccount(mint.publicKey);
  if (!boundingCurveAccount) {
    let tokenMetadata = {
      name: metadata.name,
      symbol: metadata.symbol,
      description: metadata.description,
      showName: metadata.showName,
      createOn: metadata.createdOn,
      twitter: metadata.twitter,
      telegram: metadata.telegram,
      website: metadata.website,
      file: await openAsBlob("./upload/1.jpg"),
    };

    let createResults = await createAndBuy(
      mainWallet,
      mint,
      buyers, // buyers
      tokenMetadata,
      BigInt(swapSolAmount * LAMPORTS_PER_SOL),
      SLIPPAGE_BASIS_POINTS,
      {
        unitLimit: 600_000,
        unitPrice: 200_000,
      },
    );

    if (createResults) {
      console.log("Success: ", `https://pump.fun/${mint.publicKey.toBase58()}`);
      buyers.map((buyer, i) => {
        printSPLBalance(connection, mint.publicKey, buyer.publicKey);
      })
      boundingCurveAccount = await sdk.getBondingCurveAccount(mint.publicKey);
      console.log("Bonding curve after create and buy", boundingCurveAccount);
    }

    // if (createResults.confirmed) {
    //   console.log("Success: ", `https://pump.fun/${mint.publicKey.toBase58()}`);
    //   console.log("Jito Fee TX: ", createResults.jitoTxsignature);
    //   boundingCurveAccount = await sdk.getBondingCurveAccount(mint.publicKey);
    //   console.log("Bonding curve after create and buy", boundingCurveAccount);
    //   printSPLBalance(connection, mint.publicKey, devAccount.publicKey);
    // }
  } else {

    //   let tokenMetadata = {
    //     name: metadata.name,
    //     symbol: metadata.symbol,
    //     description: metadata.description,
    //     showName: metadata.showName,
    //     createOn: metadata.createdOn,
    //     twitter: metadata.twitter,
    //     telegram: metadata.telegram,
    //     website: metadata.website,
    //     file: await openAsBlob("./upload/1.jpg"),
    //   };

    //   let createResults = await createAndBuy(
    //     mainWallet,
    //     mint,
    //     buyers, // buyers
    //     tokenMetadata,
    //     BigInt(0.0001 * LAMPORTS_PER_SOL),
    //     SLIPPAGE_BASIS_POINTS,
    //     {
    //       unitLimit: 600_000,
    //       unitPrice: 200_000,
    //     },
    //   );

    //   console.log("boundingCurveAccount", boundingCurveAccount);
    //   console.log("Success:", `https://pump.fun/${mint.publicKey.toBase58()}`);
    //   printSPLBalance(connection, mint.publicKey, mainWallet.publicKey);
  }

};

main();


const distributeSol = async (buyers: Keypair[], swapSolAmount: number, mainWallet: Keypair) => {

  const walletNum = buyers.length
  const batchSize = 15
  const batchNum = Math.ceil(buyers.length / batchSize)

  try {
    for (let i = 0; i < batchNum; i++) {
      const sendSolTx: TransactionInstruction[] = []
      sendSolTx.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250_000 })
      )
      for (let j = 0; j < batchSize; j++) {
        let solAmount = swapSolAmount
        if ((i * batchSize + j) >= walletNum) continue;
        sendSolTx.push(
          SystemProgram.transfer({
            fromPubkey: mainWallet.publicKey,
            toPubkey: buyers[i * batchSize + j].publicKey,
            lamports: solAmount * LAMPORTS_PER_SOL
          })
        )
      }
      let index = 0
      while (true) {
        try {
          if (index > 3) {
            console.log("Error in distribution")
            return null
          }
          const siTx = new Transaction().add(...sendSolTx)
          const latestBlockhash = await connection.getLatestBlockhash()
          siTx.feePayer = mainWallet.publicKey
          siTx.recentBlockhash = latestBlockhash.blockhash
          const messageV0 = new TransactionMessage({
            payerKey: mainWallet.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: sendSolTx,
          }).compileToV0Message()
          const transaction = new VersionedTransaction(messageV0)
          transaction.sign([mainWallet])
          const txSig = await execute(transaction, latestBlockhash, 1)
          const tokenBuyTx = txSig ? `https://solscan.io/tx/${txSig}` : ''
          console.log("SOL distributed ", tokenBuyTx)
          break
        } catch (error) {
          index++
        }
      }
    }
    console.log("Successfully distributed sol to bundler wallets!")
  } catch (error) {
    console.log(`Failed to transfer SOL`)
  }
}
// Buy and sell
// if (boundingCurveAccount) {
//   // buy 0.0001 SOL worth of tokens
//   let buyResults = await sdk.buy(
//     testAccount,
//     // mint.publicKey,
//     new PublicKey("3ZQuEN9gE14TXxYnMvWq86RBvh6wTdvtSaM1hhdXb2xQ"),
//     BigInt(0.0001 * LAMPORTS_PER_SOL),
//     SLIPPAGE_BASIS_POINTS,
//     {
//       unitLimit: 5_000_000,
//       unitPrice: 200_000,
//     },
//   );
//   if (buyResults.success) {
//     printSPLBalance(connection, mint.publicKey, testAccount.publicKey);
//     console.log("Bonding curve after buy", await sdk.getBondingCurveAccount(mint.publicKey));
//   } else {
//     console.log("Buy failed");
//   }

//   // buy 0.0001 SOL worth of tokens
//   let buyResultsByBuyer = await sdk.buy(
//     buyer,
//     // mint.publicKey,
//     new PublicKey("p89evAyzjd9fphjJx7G3RFA48sbZdpGEppRcfRNpump"),
//     BigInt(0.0001 * LAMPORTS_PER_SOL),
//     SLIPPAGE_BASIS_POINTS,
//     {
//       unitLimit: 5_000_000,
//       unitPrice: 200_000,
//     },
//   );

//   if (buyResultsByBuyer.success) {
//     printSPLBalance(connection, mint.publicKey, buyer.publicKey);
//     console.log("Bonding curve after buy ", await sdk.getBondingCurveAccount(mint.publicKey));
//   } else {
//     console.log("Buy failed");
//   }

//   // sell all tokens
//   let currentSPLBalance = await getSPLBalance(
//     connection,
//     mint.publicKey,
//     testAccount.publicKey
//   );
//   console.log("currentSPLBalance ", currentSPLBalance);
//   if (currentSPLBalance) {
//     let sellResults = await sdk.sell(
//       testAccount,
//       mint.publicKey,
//       BigInt(currentSPLBalance * Math.pow(10, DEFAULT_DECIMALS)),
//       SLIPPAGE_BASIS_POINTS,
//       {
//         unitLimit: 5_000_000,
//       unitPrice: 200_000,
//       },
//     );
//     if (sellResults.success) {
//       await printSOLBalance(
//         connection,
//         testAccount.publicKey,
//         "Test Account keypair"
//       );

//       printSPLBalance(connection, mint.publicKey, testAccount.publicKey, "After SPL sell all");
//       console.log("Bonding curve after sell", await sdk.getBondingCurveAccount(mint.publicKey));
//     } else {
//       console.log("Sell failed");
//     }
//   }
// }