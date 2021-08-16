import * as React from "react";
import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import useProvider from "../hooks/useProvider";
import { getERC721Contract } from "../contracts/ERC721Contract";
import Image from "next/image";
import { ethers } from "ethers";

// move to lib/nftUtils.ts
export async function httpifyUrl(url: string, tokenId: string) {
  url = url.replace(/0x\{id\}/, tokenId); // OpenSea
  if (url.match(/^http/)) {
    return url;
  } else if (url.match(/^ipfs/)) {
    return url.replace(/^ipfs:\/\//, "https://cloudflare-ipfs.com/");
  } else {
    return url;
  }
}

const storefrontABI = [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256"
      }
    ],
    name: "uri",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  }
];

export async function fetchERC721TokenMetadata({
  contractAddress,
  tokenId,
  provider
}: {
  contractAddress: string;
  tokenId: string;
  provider: any;
}) {
  let tokenURI = null;
  // try fetching regular ERC721, but if it doesn't work, then try OpenSea's weird-ass way directly
  try {
    const contract = getERC721Contract({ contractAddress, provider });
    tokenURI = await contract.tokenURI(tokenId);
  } catch (err) {
    const contract = new ethers.Contract(
      contractAddress,
      storefrontABI,
      provider
    );
    tokenURI = await contract.uri(tokenId);
    if (!tokenURI) {
      throw err;
    }
  }
  const httpTokenURI = await httpifyUrl(tokenURI, tokenId);
  const response = await fetch(httpTokenURI);
  const metadata: any = await response.json();

  if (response.status === 404) {
    throw new Error(`Can't find tokenURI for ${httpTokenURI}`);
  }

  let image = null;
  if (metadata.image) {
    image = await httpifyUrl(metadata.image, tokenId);
  }

  return [metadata, image];
}

type Props = {
  contractAddress: string;
  tokenId: string;
  pixelArt?: boolean;
};

const NFTDisplayElement = styled.div``;

export const ResponsiveMaybePixelImg = styled.img<{ pixelArt?: boolean }>`
  width: 100%;
  height: auto;
  image-rendering: ${(props) => (props.pixelArt ? "pixelated" : "auto")};
  border-radius: 3px;
  overflow: hidden;
`;

const LoadingElement = styled.div`
  color: rgba(255, 255, 255, 0.5);
  margin: 1em 0em;
`;

const ErrorMessage = styled.div`
  color: red;
`;

type ResolvedNFTData = {
  metadata?: any;
  image?: string;
};

export default function NFTDisplay({
  contractAddress,
  tokenId,
  pixelArt
}: Props) {
  const provider = useProvider();
  const [loading, setLoading] = useState(false);
  const [nftData, setNftData] = useState<ResolvedNFTData>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      setLoading(true);
      try {
        const [metadata, image] = await fetchERC721TokenMetadata({
          contractAddress,
          tokenId,
          provider
        });
        setNftData({ metadata, image });
        setError(null);
      } catch (err) {
        console.log("err: ", err);
        setError(err.message);
      }
      setLoading(false);
    }
    run();
  }, [contractAddress, tokenId]);

  // if you have a contractId and tokenId,
  // then fetch the erc721 contract (todo what about eip1155?)
  // then pull the tokenURI
  // then pull the IPFS stuff from cloudflare
  // the embed the image

  return (
    <NFTDisplayElement>
      {loading && <LoadingElement>Loading... {contractAddress}</LoadingElement>}
      {nftData.image && (
        <ResponsiveMaybePixelImg
          src={nftData.image}
          alt={nftData?.metadata?.name}
          pixelArt={pixelArt}
        />
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </NFTDisplayElement>
  );
}
