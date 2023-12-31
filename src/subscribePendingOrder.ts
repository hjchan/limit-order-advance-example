import { IdlAccounts, ProgramAccount } from "@coral-xyz/anchor";
import {
  JUPITER_API_URL,
  PROGRAM_ID,
  connection,
  limitOrder,
  limitOrderProgram,
} from "./constant";
import { wait } from "./utils";
import { LimitOrder } from "@jup-ag/limit-order-sdk";
import Decimal from "decimal.js";
import { quoteMultipleOutputMints } from "./jupiterApi";
import { chunk } from "lodash";

type PriceApiQuote = {
  [mint: string]: {
    outAmount: string;
  };
};

type OrderAndPrice = {
  orders: ProgramAccount<IdlAccounts<LimitOrder>["order"]>[];
  price: PriceApiQuote;
};

type GroupByInputMint = {
  groupByInputMint: {
    [inputMint: string]: {
      [outputMint: string]: ProgramAccount<IdlAccounts<LimitOrder>["order"]>[];
    };
  };
};

type PriceByInputMint = {
  [inputMint: string]: PriceApiQuote;
};

export const subscribePendingOrder = async (): Promise<OrderAndPrice> => {
  const getOrdersAndPrice = async () => {
    const tokenListResult = await (
      await fetch(`${JUPITER_API_URL}/indexed-route-map`)
    ).json();
    const allTokens = tokenListResult["mintKeys"];
    const allTokenSet = new Set(allTokens);

    const timeNow = new Date().getTime() / 1000;
    const orders = await limitOrder.getOrders();
    const filteredOrders = orders
      .filter(({ account: { expiredAt } }) => {
        return expiredAt === null || expiredAt.toNumber() > timeNow;
      })
      .filter(
        ({ account: { inputMint, outputMint } }) =>
          allTokenSet.has(inputMint.toBase58()) &&
          allTokenSet.has(outputMint.toBase58())
      );

    const allMints = filteredOrders.flatMap(
      ({ account: { inputMint, outputMint } }) => [
        inputMint.toBase58(),
        outputMint.toBase58(),
      ]
    );

    const result = await quoteMultipleOutputMints(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
      [...new Set(allMints)], // all unique mints
      1e6 // 1 USDC
    );

    return {
      orders: filteredOrders,
      price: result.quotes,
    };
  };

  const { orders, price } = await getOrdersAndPrice();
  const result = {
    orders,
    price,
  };

  setTimeout(async () => {
    while (true) {
      try {
        const { orders, price } = await getOrdersAndPrice();
        result.orders = orders;
        result.price = price;
      } catch (e) {
        console.error("Failed to fetch position requests", e);
      }
      await wait(10_000); // sync update every 10 seconds
    }
  });

  connection.onProgramAccountChange(
    PROGRAM_ID,
    async (info) => {
      const order: IdlAccounts<LimitOrder>["order"] =
        limitOrderProgram.coder.accounts.decode("order", info.accountInfo.data);

      result.orders.push({
        account: order,
        publicKey: info.accountId,
      });
    },
    "processed",
    [
      {
        memcmp: limitOrderProgram.coder.accounts.memcmp("order"),
      },
    ]
  );

  return result;
};

export const groupOrderByInputMint = async (orderResult: {
  orders: ProgramAccount<IdlAccounts<LimitOrder>["order"]>[];
}): Promise<GroupByInputMint> => {
  const groupByInputMint = () => {
    // group by input mint then output mint
    // {
    //   Sol: {
    //     USDC: [Order, Order, Order],
    //     USDT: [Order, Order, Order],
    //   }
    // }
    return orderResult.orders.reduce((group, order) => {
      const {
        account: { inputMint, outputMint, makingAmount, takingAmount },
      } = order;

      const input = inputMint.toBase58();
      const output = outputMint.toBase58();

      group[input] = group[input] || {};
      group[input][output] = group[input][output] || [];

      const price = new Decimal(takingAmount.toString()).div(
        makingAmount.toString()
      );

      group[input][output].push({ ...order, price });
      return group;
    }, {});
  };

  const group = {
    groupByInputMint: groupByInputMint(),
  };

  setTimeout(async () => {
    while (true) {
      group.groupByInputMint = groupByInputMint();
      await wait(5_000);
    }
  });

  return group;
};

export const getPrice = async (
  orderResult: OrderAndPrice,
  group: GroupByInputMint
): Promise<{ price: PriceByInputMint }> => {
  const price: { [mint: string]: PriceApiQuote } = {};

  for (const chunkedGroup of chunk(
    Object.entries(group.groupByInputMint),
    50
  )) {
    await Promise.all(
      chunkedGroup.map(async ([inputMint, ordersWithOutputMint]) => {
        const allOutputMints = Object.keys(ordersWithOutputMint);
        if (!orderResult.price[inputMint]) return;

        const oneUsdWorthOfToken = Number(
          orderResult.price[inputMint]?.outAmount
        );

        const result = await quoteMultipleOutputMints(
          inputMint,
          allOutputMints,
          oneUsdWorthOfToken
        );
        if (!result || !result.quotes) return;
        const { quotes } = result;

        price[inputMint] = quotes;
      })
    );
  }

  const priceRef = { price };

  setTimeout(async () => {
    while (true) {
      for (const chunkedGroup of chunk(
        Object.entries(group.groupByInputMint),
        50
      )) {
        await Promise.all(
          chunkedGroup.map(async ([inputMint, ordersWithOutputMint]) => {
            const allOutputMints = Object.keys(ordersWithOutputMint);
            if (!orderResult.price[inputMint]) return;

            const oneUsdWorthOfToken = Number(
              orderResult.price[inputMint]?.outAmount
            );

            const result = await quoteMultipleOutputMints(
              inputMint,
              allOutputMints,
              oneUsdWorthOfToken
            );
            if (!result || !result.quotes) return;
            const { quotes } = result;

            priceRef.price[inputMint] = quotes;
          })
        );
      }
    }
  });

  return priceRef;
};
