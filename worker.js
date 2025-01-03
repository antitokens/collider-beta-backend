import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Buffer } from "buffer";

const endpoint =
  "https://greatest-smart-tent.solana-mainnet.quiknode.pro/c61afb9af2756c92f1dc812ac2a5b8b68c0602ff";
const ORIGIN = "https://stage.antitoken.pro"; // "http://localhost:3000" || "https://stage.antitoken.pro"
const ANTI_TOKEN_MINT = "HB8KrN7Bb3iLWUPsozp67kS4gxtbA4W5QJX4wKPvpump";
const PRO_TOKEN_MINT = "CWFa2nxUMf5d1WwKtG9FS9kjUKGwKXWSjH8hFdWspump";
const KV = Antitoken_Collider_Beta;
const START_TIME = "2024-12-25T07:30:00Z";
const END_TIME = "2025-01-02T09:30:00Z";

const duration =
  Math.round(
    (new Date(END_TIME) - new Date(START_TIME)) / (1000 * 60 * 60 * 24)
  ) + 3;

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

      // Calculate emissions data
      let totalBaryonTokens = 0;
      let totalPhotonTokens = 0;
      let baryonBalances = [];
      let photonBalances = [];
      let addresses = [];
      Object.entries(accountBalances).forEach(([wallet, balance]) => {
        totalBaryonTokens += balance.baryon;
        totalPhotonTokens += balance.photon;
        baryonBalances.push(balance.baryon);
        photonBalances.push(balance.photon);
        addresses.push(wallet);
      });

      // Calculate total tokens
      let totalAntiTokens = 0;
      let totalProTokens = 0;
      let antiBalances = [];
      let proBalances = [];
      Object.values(accountBalances).forEach((balance) => {
        totalAntiTokens += balance.anti;
        totalProTokens += balance.pro;
        antiBalances.push(balance.anti);
        proBalances.push(balance.pro);
      });

      // Calculate events over time (last N +/- 1 days)
      const dates = Array.from({ length: duration }, (_, i) => {
        const date = new Date(END_TIME);
        date.setDate(date.getDate() - i + 1);
        return date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      }).reverse();

      // Calculate events over time (last N days)
      const datesStrict = Array.from({ length: duration }, (_, i) => {
        const date = new Date(END_TIME);
        date.setDate(date.getDate() - i + 1);
        return date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      }).reverse();

      // Get all event records and bin them by date
      const eventsByDay = {};
      const eventsOverDays = {};
      dates.forEach((date) => {
        eventsByDay[date] = { pro: 0, anti: 0, baryon: 0, photon: 0 };
        eventsOverDays[date] = { pro: 0, anti: 0, baryon: 0, photon: 0 };
      });

      // Iterate through all events in KV
      const allEvents = await KV.list();
      let cumulativePro = 0;
      let cumulativeAnti = 0;
      let cumulativeBaryon = 0;
      let cumulativePhoton = 0;

      // First pass: Calculate daily totals
      for (const key of allEvents.keys) {
        if (key.name !== "account_balances") {
          const _key = await KV.get(key.name);
          if (_key) {
            const events = JSON.parse(_key);
            Object.values(events).forEach((event) => {
              if (event && event.timestamp) {
                const eventDate = new Date(event.timestamp).toLocaleDateString(
                  "en-US",
                  { year: "numeric", month: "short", day: "numeric" }
                );

                if (eventsByDay[eventDate]) {
                  eventsByDay[eventDate].anti += Number(event.anti) || 0;
                  eventsByDay[eventDate].pro += Number(event.pro) || 0;
                  eventsByDay[eventDate].baryon += Number(event.baryon) || 0;
                  eventsByDay[eventDate].photon += Number(event.photon) || 0;
                }
              }
            });
          }
        }
      }

      // Second pass: Calculate cumulative totals for all dates
      datesStrict.forEach((date) => {
        cumulativePro += eventsByDay[date].pro;
        cumulativeAnti += eventsByDay[date].anti;
        cumulativeBaryon += eventsByDay[date].baryon;
        cumulativePhoton += eventsByDay[date].photon;

        eventsOverDays[date] = {
          pro: cumulativePro,
          anti: cumulativeAnti,
          baryon: cumulativeBaryon,
          photon: cumulativePhoton,
        };
      });

      // Calculate token ranges
      const tokenRangesPro = {
        "0-100k": 0,
        "100k-1m": 0,
        "1-10m": 0,
        "10-100m": 0,
      };
      const tokenRangesAnti = {
        "0-100k": 0,
        "100k-1m": 0,
        "1-10m": 0,
        "10-100m": 0,
      };
      const tokenRangesPhoton = {
        "0-100k": 0,
        "100k-1m": 0,
        "1-10m": 0,
        "10-100m": 0,
      };
      const tokenRangesBaryon = {
        "0-100k": 0,
        "100k-1m": 0,
        "1-10m": 0,
        "10-100m": 0,
      };

      Object.values(accountBalances).forEach((balance) => {
        // Pro token ranges
        if (balance.pro > 0 && balance.pro <= 100000)
          tokenRangesPro["0-100k"]++;
        else if (balance.pro > 100000 && balance.pro <= 1000000)
          tokenRangesPro["100k-1m"]++;
        else if (balance.pro > 1000000 && balance.pro <= 10000000)
          tokenRangesPro["1-10m"]++;
        else if (balance.pro > 10000000) tokenRangesPro["10-100m"]++;

        // Anti token ranges
        if (balance.anti > 0 && balance.anti <= 100000)
          tokenRangesAnti["0-100k"]++;
        else if (balance.anti > 100000 && balance.anti <= 1000000)
          tokenRangesAnti["100k-1m"]++;
        else if (balance.anti > 1000000 && balance.anti <= 10000000)
          tokenRangesAnti["1-10m"]++;
        else if (balance.anti > 10000000) tokenRangesAnti["10-100m"]++;

        // Photon token ranges
        if (balance.photon > 0 && balance.photon <= 100000)
          tokenRangesPhoton["0-100k"]++;
        else if (balance.photon > 100000 && balance.photon <= 1000000)
          tokenRangesPhoton["100k-1m"]++;
        else if (balance.photon > 1000000 && balance.photon <= 10000000)
          tokenRangesPhoton["1-10m"]++;
        else if (balance.photon > 10000000) tokenRangesPhoton["10-100m"]++;

        // Baryon token ranges
        if (balance.baryon > 0 && balance.baryon <= 100000)
          tokenRangesBaryon["0-100k"]++;
        else if (balance.baryon > 100000 && balance.baryon <= 1000000)
          tokenRangesBaryon["100k-1m"]++;
        else if (balance.baryon > 1000000 && balance.baryon <= 10000000)
          tokenRangesBaryon["1-10m"]++;
        else if (balance.baryon > 10000000) tokenRangesBaryon["10-100m"]++;
      });

      // Metadata object
      const metadata = {
        startTime: START_TIME,
        endTime: END_TIME,
        colliderDistribution: {
          u: 0,
          s: 0,
        },
        totalDistribution: {
          u: totalBaryonTokens,
          s: totalPhotonTokens,
          bags: {
            pro: proBalances,
            anti: antiBalances,
            photon: photonBalances,
            baryon: baryonBalances,
          },
          wallets: addresses,
        },
        emissionsData: {
          total: totalBaryonTokens + totalPhotonTokens,
          baryonTokens: totalBaryonTokens,
          photonTokens: totalPhotonTokens,
        },
        collisionsData: {
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
        eventsOverTime: {
          timestamps: dates,
          events: {
            pro: dates.map((date) => eventsByDay[date].pro),
            anti: dates.map((date) => eventsByDay[date].anti),
            photon: dates.map((date) => eventsByDay[date].photon),
            baryon: dates.map((date) => eventsByDay[date].baryon),
          },
          ranges: {
            pro: tokenRangesPro,
            anti: tokenRangesAnti,
            photon: tokenRangesPhoton,
            baryon: tokenRangesBaryon,
          },
          cummulative: {
            timestamps: datesStrict,
            pro: dates.map((date) => eventsOverDays[date].pro),
            anti: dates.map((date) => eventsOverDays[date].anti),
            photon: dates.map((date) => eventsOverDays[date].photon),
            baryon: dates.map((date) => eventsOverDays[date].baryon),
          },
        },
      };

      return createCorsResponse(JSON.stringify(metadata), { status: 200 });
    } catch (error) {
      console.error("ERROR_GENERATING_METADATA:", error);
      return createCorsResponse("Error generating metadata", { status: 500 });
    }
  }

  if (request.method === "POST" && path === "/predict") {
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

      // Create event record
      const eventRecord = {
        anti: antiTokens,
        pro: proTokens,
        baryon: baryonTokens,
        photon: photonTokens,
        wallet: wallet,
        signature: signature,
        timestamp: timestamp,
      };

      // Get existing events or create new object
      const existingEvents = JSON.parse((await KV.get(wallet)) || "{}");
      // Find the next index
      const nextIndex = Object.keys(existingEvents).length + 1;
      // Add new event with index
      existingEvents[nextIndex] = eventRecord;
      // Save the updated events
      await KV.put(wallet, JSON.stringify(existingEvents));

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

      accountBalances[wallet].anti = antiTokens;
      accountBalances[wallet].pro = proTokens;
      accountBalances[wallet].baryon = baryonTokens;
      accountBalances[wallet].photon = photonTokens;

      await KV.put(accountBalancesKey, JSON.stringify(accountBalances));

      return createCorsResponse("Event recorded successfully", { status: 200 });
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

      // Create event record
      const claimRecord = {
        anti: -antiTokens,
        pro: -proTokens,
        baryon: -baryonTokens,
        photon: -photonTokens,
        wallet: wallet,
        signature: signature,
        timestamp: timestamp,
      };

      // Get existing claims or create new object
      const existingClaims = JSON.parse((await KV.get(wallet)) || "{}");
      // Find the next index
      const nextIndex = Object.keys(existingClaims).length + 1;
      // Add new claim with index
      existingClaims[nextIndex] = claimRecord;
      // Save the updated claims
      await KV.put(wallet, JSON.stringify(existingClaims));

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

      accountBalances[wallet].anti = antiTokens;
      accountBalances[wallet].pro = proTokens;
      accountBalances[wallet].baryon = baryonTokens;
      accountBalances[wallet].photon = photonTokens;

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
  headers.set("Access-Control-Allow-Origin", ORIGIN);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Content-Type", "application/json");

  const jsonBody =
    typeof body === "string" ? JSON.stringify({ message: body }) : body;
  return new Response(jsonBody, { ...init, headers });
}

function handleCorsPreflight() {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", ORIGIN);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400"); // Cache for 1 day
  return new Response(null, { status: 204, headers });
}
