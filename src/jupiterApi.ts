import { PublicKey } from "@solana/web3.js";
import { JUPITER_API_URL } from "./constant";

export interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: string;
  priceImpactPct: string;
  routePlan: any;
  contextSlot: number;
  timeTaken: number;
  error: any;
}

export const getQuote = async (
  fromMint: PublicKey,
  toMint: PublicKey,
  amount: number | string
): Promise<QuoteResponse> =>
  fetch(
    `${JUPITER_API_URL}/quote?outputMint=${toMint.toBase58()}&inputMint=${fromMint.toBase58()}&amount=${amount}&quoteType=bellman-ford&slippageBps=0&maxAccounts=44`
  )
    .then((response) => response.json())
    .catch((err) => {
      console.log(
        `error fetching: ${JUPITER_API_URL}/quote?outputMint=${toMint.toBase58()}&inputMint=${fromMint.toBase58()}&amount=${amount}&quoteType=bellman-ford&slippageBps=0&maxAccounts=44`
      );
    });

export const getSwapIx = async (user: PublicKey, quote: any) => {
  const data = {
    quoteResponse: quote,
    userPublicKey: user.toBase58(),
    computeUnitPriceMicroLamports: 5000,
    useSharedAccounts: true,
    skipUserAccountsRpcCalls: true,
  };

  return fetch(`${JUPITER_API_URL}/swap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
    .then((response) => response.json())
    .catch((err) => {
      console.log(`error fetching: ${JUPITER_API_URL}/swap`);
    });
};

export const getPrice = async (token: PublicKey) => {
  return fetch(`https://price.jup.ag/v4/price?ids=SOL&vsToken=${token}`)
    .then((response) => response.json())
    .catch((err) => {
      console.log(
        `error fetching: https://price.jup.ag/v4/price?ids=SOL&vsToken=${token}`
      );
    });
};

export const quoteMultipleOutputMints = async (
  inputMint: string,
  outputMints: string[],
  amount: number
) => {
  const quoteUrl = `${JUPITER_API_URL}/quote-multiple-output-mints`;
  try {
    const request = {
      inputMint,
      outputMints,
      amount: amount.toString(),
    };
    const response = await fetch(quoteUrl, {
      method: "post",
      body: JSON.stringify(request),
    });
    const quoteResponse = (await response.json()) as {
      quotes: { [mint: string]: { outAmount: string } };
    };

    return quoteResponse;
  } catch (err) {
    console.log(`error fetching: ${quoteUrl}`);
  }
};
