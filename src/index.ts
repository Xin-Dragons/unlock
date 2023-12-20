import * as dotenv from "dotenv"

import fs from "fs"

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { getAllAssetsByCollection, getAllNfts, getAllNftsByCreator } from "./helius"
import {
  TokenStandard,
  fetchAllDigitalAsset,
  mplTokenMetadata,
  unlockV1,
} from "@metaplex-foundation/mpl-token-metadata"
import { keypairIdentity, publicKey, transactionBuilder, unwrapOption } from "@metaplex-foundation/umi"

import { Command } from "commander"
import figlet from "figlet"
import { compact } from "lodash"
import base58 from "bs58"
import { DAS } from "helius-sdk"
import { findAssociatedTokenPda } from "@metaplex-foundation/mpl-toolbox"

dotenv.config({ path: __dirname + "/../.env" })

const program = new Command()

console.log(figlet.textSync("Unlocker"))
console.log(process.env)

program
  .version("1.0.0")
  .description("An CLI for unlocking NFTs")
  .option("-mvc, --collection  <value>", "Metaplex Certified Collection")
  .option("-fvc, --creator <value>", "First Verified Creator")
  .option("-h, --hashlist <value>", "Path to hashlist")
  .option("-s, --secret <value>", "Secret key (string)")
  .option("-k, --keypair <value>", "Path to keypair")
  .parse(process.argv)

const options = program.opts()

const RPC_HOST = process.env.RPC_HOST

if (!RPC_HOST) {
  throw new Error("RPC HOST REQUIRED")
}

async function unlock({
  collection,
  creator,
  hashlist,
  keypair,
}: {
  collection?: string
  creator?: string
  hashlist?: string[]
  keypair: Uint8Array
}) {
  console.log("Fetching assets...")
  const umi = createUmi(RPC_HOST!).use(mplTokenMetadata())

  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(keypair)))

  let das: DAS.GetAssetResponse[] = []
  if (collection) {
    das = await getAllAssetsByCollection(collection)
  } else if (creator) {
    das = await getAllNftsByCreator(creator)
  } else if (hashlist && hashlist.length) {
    das = await getAllNfts(hashlist)
  } else {
    throw new Error("collection or creator required")
  }

  const assets = await fetchAllDigitalAsset(
    umi,
    das.map((da) => publicKey(da.id))
  )

  console.log("Unlocking...")

  const tx = transactionBuilder().add(
    assets.map((da) => {
      const asset = das.find((d) => d.id === da.publicKey)
      const owner = publicKey(asset?.ownership.owner!)
      return unlockV1(umi, {
        mint: da.publicKey,
        tokenStandard: unwrapOption(da.metadata.tokenStandard) || TokenStandard.NonFungible,
        tokenOwner: owner,
        token: findAssociatedTokenPda(umi, {
          mint: da.publicKey,
          owner,
        }),
      })
    })
  )

  const txs = await Promise.all(tx.unsafeSplitByTransactionSize(umi).map((tx) => tx.buildAndSign(umi)))

  let successes = 0
  let errors = 0

  const blockhash = await umi.rpc.getLatestBlockhash()

  await Promise.all(
    txs.map(async (t) => {
      try {
        const sig = await umi.rpc.sendTransaction(t)
        const conf = await umi.rpc.confirmTransaction(sig, {
          strategy: {
            type: "blockhash",
            ...blockhash,
          },
        })

        if (conf.value.err) {
          errors += t.message.instructions.length
        } else {
          successes += t.message.instructions.length
        }
      } catch (err) {
        console.error(err)
        errors += t.message.instructions.length
      }
    })
  )

  console.log(`Processed ${das.length} mints. Successes ${successes}, Errors: ${errors}`)
  if (errors) {
    console.log("Re-run to retry errors.")
  }
}

if (compact([options.collection, options.creator, options.hashlist]).length !== 1) {
  throw new Error("Invalid params. Please pass in collection or creator, or hashlist")
}

let keypair: Uint8Array

if (!options.keypair && !options.secret) {
  throw new Error("Must provide secret key or keypair")
}

if (options.keypair) {
  const kp = JSON.parse(fs.readFileSync(options.keypair).toString())
  keypair = new Uint8Array(kp)
} else {
  keypair = base58.decode(options.secret)
}

if (options.collection) {
  unlock({ collection: options.collection, keypair })
} else if (options.creatorAddress) {
  unlock({ creator: options.creator, keypair })
} else if (options.hashlist) {
  try {
    const hashlist = JSON.parse(fs.readFileSync(options.hashlist).toString())
    console.log({ hashlist })
    unlock({ hashlist, keypair })
  } catch {
    throw new Error("invalid hashlist - please pass a path to a json array of mints")
  }
} else {
  throw new Error("Missing params")
}
