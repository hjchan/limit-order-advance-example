import { Order } from "@jup-ag/limit-order-sdk";
import { Decimal } from "decimal.js";
import { createTimer, init, wait } from "./utils";
import { PublicKey } from "@solana/web3.js";
import { chunk } from "lodash";
import { executeUsingFlashFill } from "./executeUsingFlashFill";
import {
  getPrice,
  groupOrderByInputMint,
  subscribePendingOrder,
} from "./subscribePendingOrder";

export async function main() {
  try {
    // initialize: get lookup table and token account map
    const { limitOrderLookupTable, blockhashRef } = await init();
    const pendingOrdersRef = await subscribePendingOrder();
    const groupOrders = await groupOrderByInputMint(pendingOrdersRef);
    const priceRefs = await getPrice(pendingOrdersRef, groupOrders);

    while (true) {
      let timer = createTimer();
      console.log({
        pendingOrders: pendingOrdersRef.orders.length,
        groupOrders: Object.keys(groupOrders.groupByInputMint).length,
      });

      for (const chunkedGroup of chunk(
        Object.entries(groupOrders.groupByInputMint),
        200
      )) {
        await Promise.all(
          chunkedGroup.map(async ([inputMint, ordersWithOutputMint]) => {
            const quotes = priceRefs.price[inputMint];
            if (
              !quotes ||
              !pendingOrdersRef.price ||
              !pendingOrdersRef.price[inputMint] ||
              !pendingOrdersRef.price[inputMint].outAmount
            )
              return;

            const oneUsdWorthOfToken = Number(
              pendingOrdersRef.price[inputMint].outAmount
            );

            await Promise.all(
              Object.entries(ordersWithOutputMint).map(
                async ([outputMint, orders]: [
                  string,
                  { publicKey: PublicKey; account: Order; price: Decimal }[]
                ]) => {
                  if (!quotes[outputMint] || !quotes[outputMint].outAmount)
                    return;
                  const quotePrice = new Decimal(
                    quotes[outputMint].outAmount
                  ).div(oneUsdWorthOfToken);

                  // filter orders with quote price is within 0.3% range of order price
                  // might able to lower the range
                  const filteredOrder = orders.filter(({ price }) =>
                    quotePrice.mul(1.003).gte(price)
                  );

                  for (let chunkedOrders of chunk(filteredOrder, 50)) {
                    await Promise.all(
                      chunkedOrders.map(async (order) => {
                        await executeUsingFlashFill({
                          order,
                          inAmount: order.account.makingAmount,
                          limitOrderLookupTable,
                          blockhash: blockhashRef.blockhash,
                          fiveUsdWorthOfToken: oneUsdWorthOfToken * 5,
                        });
                      })
                    );
                  }
                }
              )
            );
          })
        );
      }

      await wait(1000);
      console.log("limit order loop used: ", timer.elapsed(), "s");
    }
  } catch (err) {
    console.error({ err });
    process.exit(1);
  }
}

main();
