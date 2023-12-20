import * as dotenv from "dotenv"
import { Cluster } from "@solana/web3.js"
import { DAS, Helius } from "helius-sdk"
import { chunk, flatten, result } from "lodash"

dotenv.config({ path: __dirname + "/../.env" })

console.log(process.env.HELIUS_API_KEY)
const helius = new Helius(process.env.HELIUS_API_KEY!)

export async function getNftsFromCreatorForOwner(creators: string[], ownerAddress: string) {
  const assets = flatten(
    await Promise.all(
      creators.map(
        async (creator) =>
          (
            await helius.rpc.searchAssets({
              ownerAddress,
              creatorAddress: creator,
              page: 1,
            })
          ).items
      )
    )
  )

  return assets
}

export async function getNftsFromCollectionsForOwner(collections: string[], ownerAddress: string) {
  const assets = flatten(
    await Promise.all(
      collections.map(
        async (collection) =>
          (
            await helius.rpc.searchAssets({
              ownerAddress,
              grouping: ["collection", collection],
              page: 1,
            })
          ).items
      )
    )
  )

  return assets
}

export async function getNftsByCreators(creatorAddress: string, page = 1) {
  return await helius.rpc.getAssetsByCreator({
    creatorAddress,
    page,
    limit: 1000,
    displayOptions: {
      showGrandTotal: true,
    },
  })
}

export async function getSample(params: any) {
  return (
    await helius.rpc.searchAssets({
      ...params,
      page: 1,
    })
  ).items
}

export async function getAllNftsByCreator(creatorAddress: string) {
  let page = 1
  let total = 1_001
  const digitalAssets = []
  while (digitalAssets.length < total) {
    const result = await getNftsByCreators(creatorAddress, page)
    digitalAssets.push(...result.items)
    total = result.grand_total as any as number
    page += 1
  }
  return digitalAssets
}

export async function getNftsByCollection(collection: string, page = 1) {
  return await helius.rpc.getAssetsByGroup({
    groupKey: "collection",
    groupValue: collection,
    page,
    limit: 1000,
    displayOptions: {
      showGrandTotal: true,
    },
  })
}

export async function getAllAssetsByCollection(collection: string): Promise<DAS.GetAssetResponse[]> {
  let page = 1
  let total = 1_001
  const digitalAssets = []
  while (digitalAssets.length < total) {
    const result = await getNftsByCollection(collection, page)
    digitalAssets.push(...result.items)
    total = result.grand_total as any as number
    page += 1
  }
  return digitalAssets
}

export async function getAllNftsByCreators(creators: string[]) {
  return flatten(await Promise.all(creators.map(getAllNftsByCreator)))
}

export async function getAllCollectionsCreatedByOwner(authorityAddress: string) {
  let page = 1
  let total = 1_001
  const digitalAssets = []
  while (digitalAssets.length < total) {
    const result = await getCollectionsCreatedByOwner(authorityAddress, page)
    digitalAssets.push(...result.items)
    total = result.grand_total as any as number
    page += 1
  }
  return digitalAssets
}

export async function getCollectionsCreatedByOwner(authorityAddress: string, page = 1) {
  return await helius.rpc.getAssetsByAuthority({
    authorityAddress,
    page,
    limit: 1000,
    displayOptions: {
      showGrandTotal: true,
    },
  })
}

export async function getAllNfts(ids: string[]) {
  const chunks = chunk(ids, 1000)

  const assets: DAS.GetAssetResponse[] = []

  await chunks.reduce((promise, c) => {
    return promise.then(async () => {
      try {
        const part = await helius.rpc.getAssetBatch({ ids: c })
        assets.push(...part)
      } catch (err) {
        console.log(err)
      }
    })
  }, Promise.resolve())

  return assets
}
