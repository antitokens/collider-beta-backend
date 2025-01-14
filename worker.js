import { Connection, PublicKey } from "@solana/web3.js";

const endpoint =
  "https://greatest-smart-tent.solana-mainnet.quiknode.pro/c61afb9af2756c92f1dc812ac2a5b8b68c0602ff";
const ORIGINS = [
  "https://stage.antitoken.pro",
  "https://lite.antitoken.pro",
  "http://localhost:3000",
];
const ANTI_TOKEN_MINT = "EWkvvNnLasHCBpeDbitzx9pC8PMX4QSdnMPfxGsFpump";
const PRO_TOKEN_MINT = "FGWJcZQ3ex8TRPC127NsQBpoXhJXeL2FFpRdKFjRpump";
const KV = Antitoken_Collider_Beta;

// Set duration
const START_TIME = "2025-01-12T03:00:00.000Z";
const END_TIME = "2025-01-14T15:00:00.000Z";

// Calculate globals
const startTime = new Date(START_TIME);
const endTime = new Date(END_TIME);
const timeDiffHours = (endTime - startTime) / (1000 * 60 * 60);

// Determine the binning strategy based on duration
let binningStrategy;
if (timeDiffHours <= 24) {
  binningStrategy = "hourly";
} else if (timeDiffHours <= 72) {
  binningStrategy = "6-hour";
} else if (timeDiffHours <= 144) {
  binningStrategy = "12-hour";
} else {
  binningStrategy = "daily";
}

// Calculate binning based on binning strategy
const duration = (() => {
  switch (binningStrategy) {
    case "hourly":
      // Pad with 1 bin each to the left & right (+ 1)
      return Math.ceil(timeDiffHours) + 3;
    case "6-hour":
      // Pad with 1 bin each to the left & right (+ 1)
      return Math.ceil(timeDiffHours / 6) + 3;
    case "12-hour":
      // Pad with 1 bin each to the left & right (+ 1)
      return Math.ceil(timeDiffHours / 12) + 3;
    default:
      // Pad with 1 bin each to the left & right (+ 1)
      return Math.ceil((endTime - startTime) / (1000 * 60 * 60 * 24)) + 3;
  }
})();

function formatUTCDateTime(date, binningStrategy = null) {
  if (binningStrategy === "daily") {
    return date.toLocaleDateString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function parseCustomDate(dateStr) {
  const parts = dateStr.split(", ");
  const hasTime = parts.length > 2;
  const monthDay = parts[0];
  const year = parts[1];
  const time = hasTime ? parts[2] : null;
  const [month, day] = monthDay.split(" ");

  const months = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  if (hasTime) {
    const [hour, period] = time.split(" ");
    let hour24 = parseInt(hour);
    if (period === "PM" && hour24 !== 12) hour24 += 12;
    if (period === "AM" && hour24 === 12) hour24 = 0;

    return new Date(
      Date.UTC(parseInt(year), months[month], parseInt(day), hour24)
    );
  }

  return new Date(Date.UTC(parseInt(year), months[month], parseInt(day)));
}

// Binning helper
const findBinForTimestamp = (timestamp, bins) => {
  const timestampDate = new Date(timestamp);
  return (
    bins.findLast((bin) => {
      const binDate = parseCustomDate(bin);
      return binDate.getTime() <= timestampDate.getTime();
    }) || bins[0]
  );
};

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

// Get token supply helper
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

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    // Handle CORS preflight requests
    return handleCorsPreflight(request, ORIGINS);
  }

  if (request.method === "GET" && path === "/claims") {
    try {
      const nowTime = new Date();

      // Get all account claims
      const accountValues = JSON.parse(
        (await KV.get("account_claims")) || "{}"
      );

      // Calculate emissions data
      let totalBaryonTokens = 0;
      let totalPhotonTokens = 0;
      let baryonBalances = [];
      let photonBalances = [];
      let addresses = [];
      Object.entries(accountValues).forEach(([wallet, balance]) => {
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
      Object.values(accountValues).forEach((balance) => {
        totalAntiTokens += balance.anti;
        totalProTokens += balance.pro;
        antiBalances.push(balance.anti);
        proBalances.push(balance.pro);
      });

      // Calculate events over time (last N +/- 1 bins)
      const bins = Array.from({ length: duration }, (_, i) => {
        const bins = new Date(END_TIME);
        switch (binningStrategy) {
          case "hourly":
            bins.setUTCHours(bins.getUTCHours() - i + 1);
            break;
          case "6-hour":
            bins.setUTCHours(bins.getUTCHours() - i * 6 + 6);
            break;
          case "12-hour":
            bins.setUTCHours(bins.getUTCHours() - i * 12 + 12);
            break;
          default:
            bins.setUTCDate(bins.getUTCDate() - i + 1);
        }
        return formatUTCDateTime(bins, binningStrategy);
      }).reverse();

      // Get all event records and bin them
      const eventsByBin = {};
      const eventsOverBins = {};
      bins.forEach((bin) => {
        eventsByBin[bin] = { pro: 0, anti: 0, baryon: 0, photon: 0 };
        eventsOverBins[bin] = { pro: 0, anti: 0, baryon: 0, photon: 0 };
      });

      // Iterate through all events in KV
      const allEvents = await KV.list();
      let cumulativePro = 0;
      let cumulativeAnti = 0;
      let cumulativeBaryon = 0;
      let cumulativePhoton = 0;

      // First pass: Calculate by-bin totals
      for (const key of allEvents.keys) {
        if (key.name !== "account_balances" && key.name !== "account_claims") {
          const _key = await KV.get(key.name);
          if (_key) {
            const events = JSON.parse(_key);
            // Get array of unique wallets
            const uniqueWallets = [
              ...new Set(
                Object.values(events)
                  .filter((event) => event && event.wallet)
                  .map((event) => event.wallet)
              ),
            ];

            // For each wallet, find their latest event
            const walletContributions = uniqueWallets.map((wallet) => {
              // Since events are chronologically indexed, find the last event for this wallet
              const latestEvent = Object.values(events)
                .filter((event) => event && event.wallet === wallet)
                .pop(); // Gets last element since events are chronologically indexed
              return latestEvent;
            });

            // Sum up all wallet contributions into bins
            walletContributions.forEach((event) => {
              if (!event || !event.timestamp) return;
              /*
              const time =
                new Date(event.timestamp) < endTime ||
                new Date(event.timestamp) > nowTime;
              */
              const time = new Date(event.timestamp) < endTime;
              if (time) return;
              const eventBin = findBinForTimestamp(event.timestamp, bins);
              if (eventsByBin[eventBin]) {
                eventsByBin[eventBin].anti += Number(event.anti) || 0;
                eventsByBin[eventBin].pro += Number(event.pro) || 0;
                eventsByBin[eventBin].baryon += Number(event.baryon) || 0;
                eventsByBin[eventBin].photon += Number(event.photon) || 0;
              }
            });
          }
        }
      }

      // Second pass: Calculate cumulative totals for all bins
      bins.forEach((bin) => {
        /*
        const _bin = parseCustomDate(bin);
        const time = _bin < endTime || _bin > nowTime;
        */
        const time = false;
        if (time) {
          cumulativePro = 0;
          cumulativeAnti = 0;
          cumulativeBaryon = 0;
          cumulativePhoton = 0;
        } else {
          cumulativePro += eventsByBin[bin].pro;
          cumulativeAnti += eventsByBin[bin].anti;
          cumulativeBaryon += eventsByBin[bin].baryon;
          cumulativePhoton += eventsByBin[bin].photon;
        }
        eventsOverBins[bin] = {
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

      Object.values(accountValues).forEach((balance) => {
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
          range: [],
          distribution: [],
          short: [],
          curve: [],
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
          timestamps: bins,
          events: {
            pro: bins.map((bin) => eventsByBin[bin].pro),
            anti: bins.map((bin) => eventsByBin[bin].anti),
            photon: bins.map((bin) => eventsByBin[bin].photon),
            baryon: bins.map((bin) => eventsByBin[bin].baryon),
          },
          ranges: {
            pro: tokenRangesPro,
            anti: tokenRangesAnti,
            photon: tokenRangesPhoton,
            baryon: tokenRangesBaryon,
          },
          cumulative: {
            timestamps: bins,
            pro: bins.map((bin) => eventsOverBins[bin].pro),
            anti: bins.map((bin) => eventsOverBins[bin].anti),
            photon: bins.map((bin) => eventsOverBins[bin].photon),
            baryon: bins.map((bin) => eventsOverBins[bin].baryon),
          },
        },
      };

      return createCorsResponse(JSON.stringify(metadata), { status: 200 });
    } catch (error) {
      console.error("ERROR_GENERATING_CLAIMS:", error);
      return createCorsResponse("Error generating claims", { status: 500 });
    }
  }

  if (request.method === "GET" && path === "/balances") {
    try {
      const nowTime = new Date();

      // Get all account balances
      const accountValues = JSON.parse(
        (await KV.get("account_balances")) || "{}"
      );

      // Calculate emissions data
      let totalBaryonTokens = 0;
      let totalPhotonTokens = 0;
      let baryonBalances = [];
      let photonBalances = [];
      let addresses = [];
      Object.entries(accountValues).forEach(([wallet, balance]) => {
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
      Object.values(accountValues).forEach((balance) => {
        totalAntiTokens += balance.anti;
        totalProTokens += balance.pro;
        antiBalances.push(balance.anti);
        proBalances.push(balance.pro);
      });

      // Calculate events over time (last N +/- 1 bins)
      const bins = Array.from({ length: duration }, (_, i) => {
        const bins = new Date(END_TIME);
        switch (binningStrategy) {
          case "hourly":
            bins.setUTCHours(bins.getUTCHours() - i + 1);
            break;
          case "6-hour":
            bins.setUTCHours(bins.getUTCHours() - i * 6 + 6);
            break;
          case "12-hour":
            bins.setUTCHours(bins.getUTCHours() - i * 12 + 12);
            break;
          default:
            bins.setUTCDate(bins.getUTCDate() - i + 1);
        }
        return formatUTCDateTime(bins, binningStrategy);
      }).reverse();

      // Get all event records and bin them
      const eventsByBin = {};
      const eventsOverBins = {};
      bins.forEach((bin) => {
        eventsByBin[bin] = { pro: 0, anti: 0, baryon: 0, photon: 0 };
        eventsOverBins[bin] = { pro: 0, anti: 0, baryon: 0, photon: 0 };
      });

      // Iterate through all events in KV
      const allEvents = await KV.list();
      let cumulativePro = 0;
      let cumulativeAnti = 0;
      let cumulativeBaryon = 0;
      let cumulativePhoton = 0;

      // First pass: Calculate by-bin totals
      for (const key of allEvents.keys) {
        if (key.name !== "account_balances" && key.name !== "account_claims") {
          const _key = await KV.get(key.name);
          if (_key) {
            const events = JSON.parse(_key);
            // Get array of unique wallets
            const uniqueWallets = [
              ...new Set(
                Object.values(events)
                  .filter((event) => event && event.wallet)
                  .map((event) => event.wallet)
              ),
            ];

            // For each wallet, find their latest event
            const walletContributions = uniqueWallets.map((wallet) => {
              // Since events are chronologically indexed, find the last event for this wallet
              const latestEvent = Object.values(events)
                .filter((event) => event && event.wallet === wallet)
                .pop(); // Gets last element since events are chronologically indexed
              return latestEvent;
            });

            // Sum up all wallet contributions into bins
            walletContributions.forEach((event) => {
              if (!event || !event.timestamp) return;
              /*
              const time =
                new Date(event.timestamp) < startTime ||
                new Date(event.timestamp) > endTime ||
                new Date(event.timestamp) > nowTime;
              */
              const time =
                new Date(event.timestamp) < startTime ||
                new Date(event.timestamp) > endTime;
              if (time) return;
              const eventBin = findBinForTimestamp(event.timestamp, bins);
              if (eventsByBin[eventBin]) {
                eventsByBin[eventBin].anti += Number(event.anti) || 0;
                eventsByBin[eventBin].pro += Number(event.pro) || 0;
                eventsByBin[eventBin].baryon += Number(event.baryon) || 0;
                eventsByBin[eventBin].photon += Number(event.photon) || 0;
              }
            });
          }
        }
      }

      // Second pass: Calculate cumulative totals for all bins
      bins.forEach((bin) => {
        /*
        const _bin = parseCustomDate(bin);
        const time = _bin < startTime || _bin > endTime || _bin > nowTime;
        */
        const time = false;
        if (time) {
          cumulativePro = 0;
          cumulativeAnti = 0;
          cumulativeBaryon = 0;
          cumulativePhoton = 0;
        } else {
          cumulativePro += eventsByBin[bin].pro;
          cumulativeAnti += eventsByBin[bin].anti;
          cumulativeBaryon += eventsByBin[bin].baryon;
          cumulativePhoton += eventsByBin[bin].photon;
        }
        eventsOverBins[bin] = {
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

      Object.values(accountValues).forEach((balance) => {
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
          timestamps: bins,
          events: {
            pro: bins.map((bin) => eventsByBin[bin].pro),
            anti: bins.map((bin) => eventsByBin[bin].anti),
            photon: bins.map((bin) => eventsByBin[bin].photon),
            baryon: bins.map((bin) => eventsByBin[bin].baryon),
          },
          ranges: {
            pro: tokenRangesPro,
            anti: tokenRangesAnti,
            photon: tokenRangesPhoton,
            baryon: tokenRangesBaryon,
          },
          cumulative: {
            timestamps: bins,
            pro: bins.map((bin) => eventsOverBins[bin].pro),
            anti: bins.map((bin) => eventsOverBins[bin].anti),
            photon: bins.map((bin) => eventsOverBins[bin].photon),
            baryon: bins.map((bin) => eventsOverBins[bin].baryon),
          },
        },
      };

      return createCorsResponse(JSON.stringify(metadata), { status: 200 });
    } catch (error) {
      console.error("ERROR_GENERATING_BALANCES:", error);
      return createCorsResponse("Error generating balances", { status: 500 });
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

  if (request.method === "POST" && path === "/reclaim") {
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
        anti: antiTokens,
        pro: proTokens,
        baryon: baryonTokens,
        photon: photonTokens,
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
      const accountClaimsKey = "account_claims";
      const accountClaims = JSON.parse(
        (await KV.get(accountClaimsKey)) || "{}"
      );

      if (!accountClaims[wallet]) {
        accountClaims[wallet] = {
          anti: 0,
          pro: 0,
          baryon: 0,
          photon: 0,
        };
      }

      accountClaims[wallet].anti = antiTokens;
      accountClaims[wallet].pro = proTokens;
      accountClaims[wallet].baryon = baryonTokens;
      accountClaims[wallet].photon = photonTokens;

      await KV.put(accountClaimsKey, JSON.stringify(accountClaims));

      return createCorsResponse("Claim recorded successfully", { status: 200 });
    } catch (error) {
      console.error("ERROR_HANDLING_CLAIM:", error);
      return createCorsResponse("Invalid request", { status: 400 });
    }
  }

  if (request.method === "GET" && path.startsWith("/balance/")) {
    const wallet = path.split("/")[2];
    const accountValues = JSON.parse(
      (await KV.get("account_balances")) || "{}"
    );
    const balance = accountValues[wallet] || {
      anti: 0,
      pro: 0,
      baryon: 0,
      photon: 0,
    };
    return createCorsResponse(JSON.stringify(balance), { status: 200 });
  }

  if (request.method === "GET" && path.startsWith("/claim/")) {
    const wallet = path.split("/")[2];
    const accountValues = JSON.parse((await KV.get("account_claims")) || "{}");
    const balance = accountValues[wallet] || {
      anti: 0,
      pro: 0,
      baryon: 0,
      photon: 0,
    };
    return createCorsResponse(JSON.stringify(balance), { status: 200 });
  }

  return createCorsResponse("NOT_FOUND", { status: 404 });
}

function createCorsResponse(body, init = {}, ORIGINS = []) {
  const headers = new Headers(init.headers || {});
  // Get the request origin from init or default to '*'
  const requestOrigin = init.origin || "*";
  // Set Access-Control-Allow-Origin based on allowed origins
  if (ORIGINS.length === 0 || ORIGINS.includes(requestOrigin)) {
    headers.set("Access-Control-Allow-Origin", requestOrigin);
  } else {
    headers.set("Access-Control-Allow-Origin", ORIGINS[0]); // Default to first allowed origin
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Content-Type", "application/json");
  const jsonBody =
    typeof body === "string" ? JSON.stringify({ message: body }) : body;
  return new Response(jsonBody, { ...init, headers });
}

function handleCorsPreflight(request = {}, ORIGINS = []) {
  const headers = new Headers();
  // Get the request origin from the OPTIONS request
  const requestOrigin = request.headers.get("Origin") || "*";
  // Set Access-Control-Allow-Origin based on allowed origins
  if (ORIGINS.length === 0 || ORIGINS.includes(requestOrigin)) {
    headers.set("Access-Control-Allow-Origin", requestOrigin);
  } else {
    headers.set("Access-Control-Allow-Origin", ORIGINS[0]); // Default to first allowed origin
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400"); // Cache for 1 day
  return new Response(null, { status: 204, headers });
}
