import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Buffer } from "buffer";

const endpoint =
  "https://greatest-smart-tent.solana-mainnet.quiknode.pro/c61afb9af2756c92f1dc812ac2a5b8b68c0602ff";
const ANTI_TOKEN_MINT = "EWkvvNnLasHCBpeDbitzx9pC8PMX4QSdnMPfxGsFpump";
const PRO_TOKEN_MINT = "FGWJcZQ3ex8TRPC127NsQBpoXhJXeL2FFpRdKFjRpump";
const KV = Antitoken_Collider_Beta;

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function getTokenSupply(tokenMintAddress) {
  try {
    const mintPubkey = new PublicKey(tokenMintAddress);
    const connection = new Connection(endpoint, "confirmed");
    // Get token supply
    const supply = await connection.getTokenSupply(mintPubkey);
    // Get decimals
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
    const decimals = mintInfo.value?.data.parsed.info.decimals || 0;

    return {
      totalSupply: supply.value.uiAmount,
      decimals: decimals,
      rawSupply: supply.value.amount,
    };
  } catch (error) {
    console.error("Error fetching token supply:", error);
    throw error;
  }
}

async function getTokenHolders(tokenMintAddress) {
  try {
    const connection = new Connection(endpoint, "confirmed");
    // Get all accounts that hold this token
    const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        {
          dataSize: 165, // Size of token account
        },
        {
          memcmp: {
            offset: 0,
            bytes: tokenMintAddress,
          },
        },
      ],
    });

    // Filter out accounts with zero balance
    const activeAccounts = accounts.filter((account) => {
      const data = Buffer.from(account.account.data);
      const amount = data.readBigUInt64LE(64);
      return amount > 0;
    });

    return {
      totalHolders: activeAccounts.length,
      holderAccounts: activeAccounts.map((account) =>
        account.pubkey.toString()
      ),
    };
  } catch (error) {
    console.error("Error fetching token holders:", error);
    throw error;
  }
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    // Handle CORS preflight requests
    return handleCorsPreflight();
  }

  if (request.method === "GET" && path === "/metadata") {
    try {
      // Get all account balances
      const accountBalances = JSON.parse(
        (await KV.get("account_balances")) || "{}"
      );

      // Calculate voters data
      let antiVoters = 0;
      let proVoters = 0;
      Object.values(accountBalances).forEach((balance) => {
        if (balance.anti > balance.pro) antiVoters++;
        if (balance.pro > balance.anti) proVoters++;
      });

      // Calculate total tokens
      let totalAntiTokens = 0;
      let totalProTokens = 0;
      Object.values(accountBalances).forEach((balance) => {
        totalAntiTokens += balance.anti;
        totalProTokens += balance.pro;
      });

      // Calculate votes over time (last 5 days)
      const dates = Array.from({ length: 5 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      }).reverse();

      // Get all vote records and bin them by date
      const votesByDay = {};
      dates.forEach((date) => {
        votesByDay[date] = { pro: 0, anti: 0 };
      });

      // Iterate through all votes in KV
      const allVotes = await KV.list(); // Get all keys
      for (const key of allVotes.keys) {
        if (key !== "account_balances") {
          const vote = JSON.parse(await KV.get(key));
          const voteDate = new Date(vote.timestamp).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric" }
          );
          if (votesByDay[voteDate]) {
            votesByDay[voteDate].anti += Number(vote.anti) || 0;
            votesByDay[voteDate].pro += Number(vote.pro) || 0;
          }
        }
      }

      // Calculate token ranges
      const tokenRangesPro = { "0-100k": 0, "100k-1m": 0, "1-10m": 0 };
      const tokenRangesAnti = { "0-100k": 0, "100k-1m": 0, "1-10m": 0 };

      Object.values(accountBalances).forEach((balance) => {
        // Pro token ranges
        if (balance.pro > 0 && balance.pro <= 100000)
          tokenRangesPro["0-100k"]++;
        else if (balance.pro > 100000 && balance.pro <= 1000000)
          tokenRangesPro["100k-1m"]++;
        else if (balance.pro > 1000000) tokenRangesPro["1-10m"]++;

        // Anti token ranges
        if (balance.anti > 0 && balance.anti <= 100000)
          tokenRangesAnti["0-100k"]++;
        else if (balance.anti > 100000 && balance.anti <= 1000000)
          tokenRangesAnti["100k-1m"]++;
        else if (balance.anti > 1000000) tokenRangesAnti["1-10m"]++;
      });

      const metadata = {
        voterDistribution: {
          value1: 0 * Math.random(),
          value2: 0 * Math.random(),
        },
        totalDistribution: {
          value1: 0 * Math.random(),
          value2: 0 * Math.random(),
        },
        votersData: {
          total: await Promise.all([
            getTokenHolders(ANTI_TOKEN_MINT),
            getTokenHolders(PRO_TOKEN_MINT),
          ]).then(([antiHolders, proHolders]) => {
            const proHoldersSet = new Set(proHolders.holderAccounts);
            const commonHolders = antiHolders.holderAccounts.filter((holder) =>
              proHoldersSet.has(holder)
            );
            // Use filter and Set.has for efficient comparison
            return commonHolders.length > 0
              ? antiHolders.totalHolders +
                  proHolders.totalHolders -
                  antiHolders.holderAccounts.filter((holder) =>
                    proHoldersSet.has(holder)
                  ).length
              : antiHolders.totalHolders + proHolders.totalHolders;
          }),
          antiVoters,
          proVoters,
        },
        tokensData: {
          total: await Promise.all([
            getTokenSupply(ANTI_TOKEN_MINT),
            getTokenSupply(PRO_TOKEN_MINT),
          ]).then(
            ([antiSupply, proSupply]) =>
              antiSupply.totalSupply + proSupply.totalSupply
          ),
          antiTokens: totalAntiTokens,
          proTokens: totalProTokens,
        },
        votesOverTime: {
          timestamps: dates,
          proVotes: dates.map((date) => votesByDay[date].pro),
          antiVotes: dates.map((date) => votesByDay[date].anti),
          tokenRangesPro,
          tokenRangesAnti,
        },
      };

      return createCorsResponse(JSON.stringify(metadata), { status: 200 });
    } catch (error) {
      console.error("ERROR_GENERATING_METADATA:", error);
      return createCorsResponse("Error generating metadata", { status: 500 });
    }
  }

  if (request.method === "POST" && path === "/vote") {
    try {
      const {
        wallet,
        antiTokens,
        proTokens,
        baryonTokens,
        photonTokens,
        signature,
        timestamp,
      } = await request.json();

      if (!wallet || !signature) {
        return createCorsResponse("Missing required parameters", {
          status: 400,
        });
      }

      if (
        isNaN(Number(antiTokens)) ||
        isNaN(Number(proTokens)) ||
        isNaN(Number(baryonTokens)) ||
        isNaN(Number(photonTokens))
      ) {
        return createCorsResponse("Invalid token values", { status: 400 });
      }

      // Create vote record
      const voteRecord = {
        anti: antiTokens,
        pro: proTokens,
        baryon: baryonTokens,
        photon: photonTokens,
        wallet: wallet,
        signature: signature,
        timestamp: timestamp,
      };

      // Save the vote
      await KV.put(wallet, JSON.stringify(voteRecord));

      // Update account balances
      const accountBalancesKey = "account_balances";
      const accountBalances = JSON.parse(
        (await KV.get(accountBalancesKey)) || "{}"
      );

      if (!accountBalances[wallet]) {
        accountBalances[wallet] = {
          anti: 0,
          pro: 0,
          baryon: 0,
          photon: 0,
        };
      }

      accountBalances[wallet].anti += Number(antiTokens);
      accountBalances[wallet].pro += Number(proTokens);
      accountBalances[wallet].baryon += Number(baryonTokens);
      accountBalances[wallet].photon += Number(photonTokens);

      await KV.put(accountBalancesKey, JSON.stringify(accountBalances));

      return createCorsResponse("Vote recorded successfully", { status: 200 });
    } catch (error) {
      console.error("ERROR_HANDLING_VOTE:", error);
      return createCorsResponse("Invalid request", { status: 400 });
    }
  }

  if (request.method === "POST" && path === "/claim") {
    try {
      const {
        wallet,
        antiTokens,
        proTokens,
        baryonTokens,
        photonTokens,
        signature,
        timestamp,
      } = await request.json();

      if (!wallet || !signature) {
        return createCorsResponse("Missing required parameters", {
          status: 400,
        });
      }

      // Create vote record
      const claimRecord = {
        anti: -antiTokens,
        pro: -proTokens,
        baryon: -baryonTokens,
        photon: -photonTokens,
        wallet: wallet,
        signature: signature,
        timestamp: timestamp,
      };

      // Save the vote
      await KV.put(wallet, JSON.stringify(claimRecord));

      // Update account balances
      const accountBalancesKey = "account_balances";
      const accountBalances = JSON.parse(
        (await KV.get(accountBalancesKey)) || "{}"
      );

      if (!accountBalances[wallet]) {
        accountBalances[wallet] = {
          anti: 0,
          pro: 0,
          baryon: 0,
          photon: 0,
        };
      }

      accountBalances[wallet].anti -= Number(antiTokens);
      accountBalances[wallet].pro -= Number(proTokens);
      accountBalances[wallet].baryon -= Number(baryonTokens);
      accountBalances[wallet].photon -= Number(photonTokens);

      await KV.put(accountBalancesKey, JSON.stringify(accountBalances));

      return createCorsResponse("Claim recorded successfully", { status: 200 });
    } catch (error) {
      console.error("ERROR_HANDLING_CLAIM:", error);
      return createCorsResponse("Invalid request", { status: 400 });
    }
  }

  if (request.method === "GET" && path.startsWith("/balances/")) {
    const wallet = path.split("/")[2];
    const accountBalances = JSON.parse(
      (await KV.get("account_balances")) || "{}"
    );
    const balance = accountBalances[wallet] || {
      anti: 0,
      pro: 0,
      baryon: 0,
      photon: 0,
    };
    return createCorsResponse(JSON.stringify(balance), { status: 200 });
  }

  return createCorsResponse("NOT_FOUND", { status: 404 });
}

function createCorsResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Access-Control-Allow-Origin", "*"); // Adjust origin if needed
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Content-Type", "application/json");

  const jsonBody =
    typeof body === "string" ? JSON.stringify({ message: body }) : body;
  return new Response(jsonBody, { ...init, headers });
}

function handleCorsPreflight() {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*"); // Adjust origin if needed
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400"); // Cache for 1 day
  return new Response(null, { status: 204, headers });
}
