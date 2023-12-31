# Limit Order Taker Example

This is a simple limit order taker example that utilise Jupiter quoting API to execute Jupiter Limit Order.

# Getting started

1. Populate these environment variable to `.env` file

```
RPC_ENDPOINT=<private rpc endpoint>
PRIVATE_KEY=<wallet private key>
JUPITER_API_URL=<self hosted Jupiter endpoint>
```

2. Install dependencies

```
pnpm install
```

3. Start the bot

```
pnpm start
```

# How it work?

1. Get all the open orders from onchain and subscribe using websocket
2. Group all the orders by input mint then output mint.

```
    // {
    //   Sol: {
    //     USDC: [Order, Order, Order],
    //     USDT: [Order, Order, Order],
    //   }
    // }
```

3. Get the price of output mint vs input mint like grouping above
4. Compare the price from quoting and the order, filters orders within 0.3% range of the quote price
5. Get quote from Jupiter Swap API and check whether the order is profitable to execute.
6. Bundle Jupiter Swap Ix with Limit Order Flash Fill Ix to execute the order.

# Flash FIll

It is similar concept with flash loan. The keeper first borrow the input amount from the order, then it use the input amount to swap in Jupiter and return with desired output amount.

Sample tx: https://solscan.io/tx/4dXdmig9nFFMpggsv59fmKJJQ8KrGstGvNhkdy2yToLpghTKUU9M8ddkAY1UUuZfg2GK3woP7BqnZ4yMCRucScmD

Using this method will not required the keeper to hold any funds, it just need SOL for transaction fees and ata token accounts rent.
