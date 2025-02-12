import { Connection, PublicKey } from "@solana/web3.js";
import { compressMetadata } from "./compress";

const ORIGINS = ["https://lite.antitoken.pro", "http://localhost:3000"];

const endpoint = env.SOL_RPC;
const ANTI_TOKEN_MINT = env.ANTI_TOKEN_MINT;
const PRO_TOKEN_MINT = env.PRO_TOKEN_MINT;
const KV = env.KV;

/// Constants
const metadataInit = ({ supply = 1e9 }) => {
  return {
    startTime: "-",
    endTime: "-",
    collider: {
      mean: 0,
      stddev: 0,
      xLong: [],
      yLong: [],
      xShort: [],
      yShort: [],
    },
    plasma: {
      mean: 0,
      stddev: 0,
      balances: {
        pro: [],
        anti: [],
        photon: [],
        baryon: [],
      },
      wallets: [],
    },
    emission: {
      total: 0,
      photon: 0,
      baryon: 0,
    },
    collision: {
      total: supply,
      pro: 0,
      anti: 0,
    },
    events: {
      timestamps: ["", "", "", "", ""],
      events: {
        pro: [],
        anti: [],
        photon: [],
        baryon: [],
      },
      ranges: {
        pro: {
          "0-100k": 0,
          "100k-1m": 0,
          "1-10m": 0,
        },
        anti: {
          "0-100k": 0,
          "100k-1m": 0,
          "1-10m": 0,
        },
        photon: {
          "0-100k": 0,
          "100k-1m": 0,
          "1-10m": 0,
        },
        baryon: {
          "0-100k": 0,
          "100k-1m": 0,
          "1-10m": 0,
        },
      },
      cumulative: {
        timestamps: [],
        pro: [],
        anti: [],
        photon: [],
        baryon: [],
      },
    },
  };
};

/// Calculate globals
function getGlobal(startTimestamp, endTimestamp) {
  let binningStrategy;

  const startTime = new Date(startTimestamp);
  const endTime = new Date(endTimestamp);
  const timeDiffHours = (endTime - startTime) / (1000 * 60 * 60);

  // Determine the binning strategy based on duration
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

  return [binningStrategy, duration];
}

/// Format time according to binning
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

/// Parse custom date format used by frontend
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

/// Binning helper
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

/// Get token supply helper
async function getTokenSupply(tokenMintAddress) {
  // CHECK: Bypass supply query
  return {
    totalSupply: 1e9,
    decimals: 1e8,
    rawSupply: 1e9,
  };

  try {
    const mintPubkey = new PublicKey(tokenMintAddress);
    const connection = new Connection(endpoint, "confirmed");
    // Get token supply
    const supply = await connection.getTokenSupply(mintPubkey);
    // Get decimals
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
    const decimals = mintInfo.value?.data.parsed.info.decimals || 0;

    return {
      totalSupply: supply.value.uiAmount || 1e9,
      decimals: decimals || 1e8,
      rawSupply: supply.value.amount || 1e9,
    };
  } catch (error) {
    console.error("Error fetching token supply:", error);
    throw error;
  }
}

/// Universal request handler
async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    // Handle CORS preflight requests
    return handleCorsPreflight(request, ORIGINS);
  }

  /// Query all predictions
  if (request.method === "GET" && path === "/predictions") {
    try {
      // Get all predictions
      const predictions = JSON.parse((await KV.get("predictions")) || "{}");
      return createCorsResponse(JSON.stringify(predictions), {
        status: 200,
      });
    } catch (error) {
      console.error("ERROR_GETTING_PREDICTIONS:", error);
      return createCorsResponse("Error getting predictions", { status: 500 });
    }
  }

  /// Query all global withdrawals
  if (request.method === "GET" && path === "/withdrawals") {
    const prediction = path.split("/")[2];
    // Get all predictions
    const predictions = JSON.parse((await KV.get("predictions")) || "{}");
    // Return if empty
    if (JSON.stringify(predictions) === "{}") {
      return createCorsResponse(
        JSON.stringify(compressMetadata(metadataInit)),
        {
          status: 201,
        }
      );
    }

    try {
      // Get config
      const [binningStrategy, duration] = getGlobal(
        predictions[Number(prediction)].schedule[0],
        predictions[Number(prediction)].schedule[1]
      );
      const startTime = predictions[Number(prediction)].schedule[0];
      const endTime = predictions[Number(prediction)].schedule[1];

      // Get all account balances
      const accounts = JSON.parse(
        (await KV.get("balances_" + prediction)) || "{}"
      );

      if (JSON.stringify(accounts) === "{}") {
        return createCorsResponse(
          JSON.stringify(compressMetadata(metadataInit)),
          {
            status: 201,
          }
        );
      }

      // Calculate emissions data
      let baryons = 0;
      let photons = 0;
      let baryonBalances = [];
      let photonBalances = [];
      let addresses = [];
      Object.entries(accounts).forEach(([wallet, balance]) => {
        baryons += balance.baryon;
        photons += balance.photon;
        baryonBalances.push(balance.baryon);
        photonBalances.push(balance.photon);
        addresses.push(wallet);
      });

      // Calculate total tokens
      let antitokens = 0;
      let protokens = 0;
      let antiBalances = [];
      let proBalances = [];
      Object.values(accounts).forEach((balance) => {
        antitokens += balance.anti;
        protokens += balance.pro;
        antiBalances.push(balance.anti);
        proBalances.push(balance.pro);
      });

      // Calculate events over time (last N +/- 1 bins)
      const bins = Array.from({ length: duration }, (_, i) => {
        const bins = nowTime;
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
      const scatter = {};
      const cumulativeScatter = {};
      bins.forEach((bin) => {
        scatter[bin] = { pro: 0, anti: 0, baryon: 0, photon: 0 };
        cumulativeScatter[bin] = { pro: 0, anti: 0, baryon: 0, photon: 0 };
      });

      // Iterate through all events in KV
      const events = await KV.list();
      let cumulativePro = 0;
      let cumulativeAnti = 0;
      let cumulativeBaryon = 0;
      let cumulativePhoton = 0;

      // First pass: Calculate by-bin totals
      for (const key of events.keys) {
        if (key.name !== "balances" && key.name !== "withdrawals") {
          const _key = await KV.get(key.name);
          if (_key) {
            const events = JSON.parse(_key);

            // Filter events for this specific prediction first
            const predictions = Object.values(events).filter(
              (event) => event && String(event.prediction) === prediction
            );

            // Get array of unique wallets for this prediction
            const users = [
              ...new Set(
                predictions
                  .filter((event) => event && event.wallet)
                  .map((event) => event.wallet)
              ),
            ];

            // For each wallet, find their latest event for this prediction
            const walletContributions = users
              .map((wallet) => {
                const user = predictions
                  .filter((event) => event && event.wallet === wallet)
                  .sort(
                    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
                  );

                return user[0]; // Get most recent event
              })
              .filter((event) => event != null); // Remove any null events

            // Sum up all wallet contributions into bins
            walletContributions.forEach((event) => {
              if (!event || !event.timestamp) return;
              const binIndex = findBinForTimestamp(event.timestamp, bins);
              if (scatter[binIndex]) {
                scatter[binIndex].anti += Number(event.anti) || 0;
                scatter[binIndex].pro += Number(event.pro) || 0;
                scatter[binIndex].baryon += Number(event.baryon) || 0;
                scatter[binIndex].photon += Number(event.photon) || 0;
              }
            });
          }
        }
      }

      // Second pass: Calculate cumulative totals for all bins
      bins.forEach((bin) => {
        const time = false;
        if (time) {
          cumulativePro = 0;
          cumulativeAnti = 0;
          cumulativeBaryon = 0;
          cumulativePhoton = 0;
        } else {
          cumulativePro += scatter[bin].pro;
          cumulativeAnti += scatter[bin].anti;
          cumulativeBaryon += scatter[bin].baryon;
          cumulativePhoton += scatter[bin].photon;
        }
      });

      // Calculate token ranges
      const rangesPro = {
        "0-100k": 0,
        "100k-1m": 0,
        "1-10m": 0,
        "10-100m": 0,
      };
      const rangesAnti = {
        "0-100k": 0,
        "100k-1m": 0,
        "1-10m": 0,
        "10-100m": 0,
      };
      const rangesPhoton = {
        "0-100k": 0,
        "100k-1m": 0,
        "1-10m": 0,
        "10-100m": 0,
      };
      const rangesBaryon = {
        "0-100k": 0,
        "100k-1m": 0,
        "1-10m": 0,
        "10-100m": 0,
      };

      Object.values(accounts).forEach((balance) => {
        // Pro token ranges
        if (balance.pro > 0 && balance.pro <= 100_000) rangesPro["0-100k"]++;
        else if (balance.pro > 100_000 && balance.pro <= 1_000_000)
          rangesPro["100k-1m"]++;
        else if (balance.pro > 1_000_000 && balance.pro <= 10_000_000)
          rangesPro["1-10m"]++;
        else if (balance.pro > 10_000_000) rangesPro["10-100m"]++;

        // Anti token ranges
        if (balance.anti > 0 && balance.anti <= 100_000) rangesAnti["0-100k"]++;
        else if (balance.anti > 100_000 && balance.anti <= 1_000_000)
          rangesAnti["100k-1m"]++;
        else if (balance.anti > 1_000_000 && balance.anti <= 10_000_000)
          rangesAnti["1-10m"]++;
        else if (balance.anti > 10_000_000) rangesAnti["10-100m"]++;

        // Photon token ranges
        if (balance.photon > 0 && balance.photon <= 100_000)
          rangesPhoton["0-100k"]++;
        else if (balance.photon > 100_000 && balance.photon <= 1_000_000)
          rangesPhoton["100k-1m"]++;
        else if (balance.photon > 1_000_000 && balance.photon <= 10_000_000)
          rangesPhoton["1-10m"]++;
        else if (balance.photon > 10_000_000) rangesPhoton["10-100m"]++;

        // Baryon token ranges
        if (balance.baryon > 0 && balance.baryon <= 100_000)
          rangesBaryon["0-100k"]++;
        else if (balance.baryon > 100_000 && balance.baryon <= 1_000_000)
          rangesBaryon["100k-1m"]++;
        else if (balance.baryon > 1_000_000 && balance.baryon <= 10_000_000)
          rangesBaryon["1-10m"]++;
        else if (balance.baryon > 10_000_000) rangesBaryon["10-100m"]++;
      });

      // Metadata object
      const metadata = {
        startTime: startTime,
        endTime: endTime,
        collider: {
          mean: 0,
          stddev: 0,
          xLong: [],
          yLong: [],
          xShort: [],
          yShort: [],
        },
        plasma: {
          mean: baryons,
          stddev: photons,
          balances: {
            pro: proBalances,
            anti: antiBalances,
            photon: photonBalances,
            baryon: baryonBalances,
          },
          wallets: addresses,
        },
        emission: {
          total: baryons + photons,
          baryons: baryons,
          photons: photons,
        },
        collision: {
          total: await Promise.all([
            getTokenSupply(ANTI_TOKEN_MINT),
            getTokenSupply(PRO_TOKEN_MINT),
          ]).then(
            ([antiSupply, proSupply]) =>
              antiSupply.totalSupply + proSupply.totalSupply
          ),
          anti: antitokens,
          pro: protokens,
        },
        events: {
          timestamps: bins,
          events: {
            pro: bins.map((bin) => scatter[bin].pro),
            anti: bins.map((bin) => scatter[bin].anti),
            photon: bins.map((bin) => scatter[bin].photon),
            baryon: bins.map((bin) => scatter[bin].baryon),
          },
          ranges: {
            pro: rangesPro,
            anti: rangesAnti,
            photon: rangesPhoton,
            baryon: rangesBaryon,
          },
          cumulative: {
            timestamps: bins,
            pro: bins.map((bin) => cumulativeScatter[bin].pro),
            anti: bins.map((bin) => cumulativeScatter[bin].anti),
            photon: bins.map((bin) => cumulativeScatter[bin].photon),
            baryon: bins.map((bin) => cumulativeScatter[bin].baryon),
          },
        },
      };

      return createCorsResponse(JSON.stringify(compressMetadata(metadata)), {
        status: 200,
      });
    } catch (error) {
      console.error("ERROR_GENERATING_WITHDRAWALS:", error);
      return createCorsResponse("Error generating withdrawals", {
        status: 500,
      });
    }
  }

  /// Query all global balances
  if (request.method === "GET" && path === "/balances") {
    const prediction = path.split("/")[2];
    // Get all predictions
    const predictions = JSON.parse((await KV.get("predictions")) || "{}");
    // Return if empty
    if (JSON.stringify(predictions) === "{}") {
      return createCorsResponse(
        JSON.stringify(compressMetadata(metadataInit)),
        {
          status: 201,
        }
      );
    }

    try {
      // Get config
      const [binningStrategy, duration] = getGlobal(
        predictions[Number(prediction)].schedule[0],
        predictions[Number(prediction)].schedule[1]
      );
      const startTime = predictions[Number(prediction)].schedule[0];
      const endTime = predictions[Number(prediction)].schedule[1];

      // Get all account balances
      const accounts = JSON.parse(
        (await KV.get("balances_" + prediction)) || "{}"
      );

      if (JSON.stringify(accounts) === "{}") {
        return createCorsResponse(
          JSON.stringify(compressMetadata(metadataInit)),
          {
            status: 201,
          }
        );
      }

      // Calculate emissions data
      let baryons = 0;
      let photons = 0;
      let baryonBalances = [];
      let photonBalances = [];
      let addresses = [];
      Object.entries(accounts).forEach(([wallet, balance]) => {
        baryons += balance.baryon;
        photons += balance.photon;
        baryonBalances.push(balance.baryon);
        photonBalances.push(balance.photon);
        addresses.push(wallet);
      });

      // Calculate total tokens
      let antitokens = 0;
      let protokens = 0;
      let antiBalances = [];
      let proBalances = [];
      Object.values(accounts).forEach((balance) => {
        antitokens += balance.anti;
        protokens += balance.pro;
        antiBalances.push(balance.anti);
        proBalances.push(balance.pro);
      });

      // Calculate events over time (last N +/- 1 bins)
      const bins = Array.from({ length: duration }, (_, i) => {
        const bins = new Date(endTime);
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
      const scatter = {};
      const cumulativeScatter = {};
      bins.forEach((bin) => {
        scatter[bin] = { pro: 0, anti: 0, baryon: 0, photon: 0 };
        cumulativeScatter[bin] = { pro: 0, anti: 0, baryon: 0, photon: 0 };
      });

      // Iterate through all events in KV
      const events = await KV.list();
      let cumulativePro = 0;
      let cumulativeAnti = 0;
      let cumulativeBaryon = 0;
      let cumulativePhoton = 0;

      // First pass: Calculate by-bin totals
      for (const key of events.keys) {
        if (key.name !== "balances" && key.name !== "withdrawals") {
          const _key = await KV.get(key.name);
          if (_key) {
            const events = JSON.parse(_key);

            // Filter events for this specific prediction first
            const predictions = Object.values(events).filter(
              (event) => event && String(event.prediction) === prediction
            );

            // Get array of unique wallets for this prediction
            const users = [
              ...new Set(
                predictions
                  .filter((event) => event && event.wallet)
                  .map((event) => event.wallet)
              ),
            ];

            // For each wallet, find their latest event for this prediction
            const walletContributions = users
              .map((wallet) => {
                const user = predictions
                  .filter((event) => event && event.wallet === wallet)
                  .sort(
                    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
                  );

                return user[0]; // Get most recent event
              })
              .filter((event) => event != null); // Remove any null events

            // Sum up all wallet contributions into bins
            walletContributions.forEach((event) => {
              if (!event || !event.timestamp) return;
              const binIndex = findBinForTimestamp(event.timestamp, bins);
              if (scatter[binIndex]) {
                scatter[binIndex].anti += Number(event.anti) || 0;
                scatter[binIndex].pro += Number(event.pro) || 0;
                scatter[binIndex].baryon += Number(event.baryon) || 0;
                scatter[binIndex].photon += Number(event.photon) || 0;
              }
            });
          }
        }
      }

      // Second pass: Calculate cumulative totals for all bins
      bins.forEach((bin) => {
        const time = false;
        if (time) {
          cumulativePro = 0;
          cumulativeAnti = 0;
          cumulativeBaryon = 0;
          cumulativePhoton = 0;
        } else {
          cumulativePro += scatter[bin].pro;
          cumulativeAnti += scatter[bin].anti;
          cumulativeBaryon += scatter[bin].baryon;
          cumulativePhoton += scatter[bin].photon;
        }
      });

      // Calculate token ranges
      const rangesPro = {
        "0-100k": 0,
        "100k-1m": 0,
        "1-10m": 0,
        "10-100m": 0,
      };
      const rangesAnti = {
        "0-100k": 0,
        "100k-1m": 0,
        "1-10m": 0,
        "10-100m": 0,
      };
      const rangesPhoton = {
        "0-100k": 0,
        "100k-1m": 0,
        "1-10m": 0,
        "10-100m": 0,
      };
      const rangesBaryon = {
        "0-100k": 0,
        "100k-1m": 0,
        "1-10m": 0,
        "10-100m": 0,
      };

      Object.values(accounts).forEach((balance) => {
        // Pro token ranges
        if (balance.pro > 0 && balance.pro <= 100_000) rangesPro["0-100k"]++;
        else if (balance.pro > 100_000 && balance.pro <= 1_000_000)
          rangesPro["100k-1m"]++;
        else if (balance.pro > 1_000_000 && balance.pro <= 10_000_000)
          rangesPro["1-10m"]++;
        else if (balance.pro > 10_000_000) rangesPro["10-100m"]++;

        // Anti token ranges
        if (balance.anti > 0 && balance.anti <= 100_000) rangesAnti["0-100k"]++;
        else if (balance.anti > 100_000 && balance.anti <= 1_000_000)
          rangesAnti["100k-1m"]++;
        else if (balance.anti > 1_000_000 && balance.anti <= 10_000_000)
          rangesAnti["1-10m"]++;
        else if (balance.anti > 10_000_000) rangesAnti["10-100m"]++;

        // Photon token ranges
        if (balance.photon > 0 && balance.photon <= 100_000)
          rangesPhoton["0-100k"]++;
        else if (balance.photon > 100_000 && balance.photon <= 1_000_000)
          rangesPhoton["100k-1m"]++;
        else if (balance.photon > 1_000_000 && balance.photon <= 10_000_000)
          rangesPhoton["1-10m"]++;
        else if (balance.photon > 10_000_000) rangesPhoton["10-100m"]++;

        // Baryon token ranges
        if (balance.baryon > 0 && balance.baryon <= 100_000)
          rangesBaryon["0-100k"]++;
        else if (balance.baryon > 100_000 && balance.baryon <= 1_000_000)
          rangesBaryon["100k-1m"]++;
        else if (balance.baryon > 1_000_000 && balance.baryon <= 10_000_000)
          rangesBaryon["1-10m"]++;
        else if (balance.baryon > 10_000_000) rangesBaryon["10-100m"]++;
      });

      // Metadata object
      const metadata = {
        startTime: startTime,
        endTime: endTime,
        collider: {
          mean: 0,
          stddev: 0,
          xLong: [],
          yLong: [],
          xShort: [],
          yShort: [],
        },
        plasma: {
          mean: baryons,
          stddev: photons,
          balances: {
            pro: proBalances,
            anti: antiBalances,
            photon: photonBalances,
            baryon: baryonBalances,
          },
          wallets: addresses,
        },
        emission: {
          total: baryons + photons,
          baryons: baryons,
          photons: photons,
        },
        collision: {
          total: await Promise.all([
            getTokenSupply(ANTI_TOKEN_MINT),
            getTokenSupply(PRO_TOKEN_MINT),
          ]).then(
            ([antiSupply, proSupply]) =>
              antiSupply.totalSupply + proSupply.totalSupply
          ),
          anti: antitokens,
          pro: protokens,
        },
        events: {
          timestamps: bins,
          events: {
            pro: bins.map((bin) => scatter[bin].pro),
            anti: bins.map((bin) => scatter[bin].anti),
            photon: bins.map((bin) => scatter[bin].photon),
            baryon: bins.map((bin) => scatter[bin].baryon),
          },
          ranges: {
            pro: rangesPro,
            anti: rangesAnti,
            photon: rangesPhoton,
            baryon: rangesBaryon,
          },
          cumulative: {
            timestamps: bins,
            pro: bins.map((bin) => cumulativeScatter[bin].pro),
            anti: bins.map((bin) => cumulativeScatter[bin].anti),
            photon: bins.map((bin) => cumulativeScatter[bin].photon),
            baryon: bins.map((bin) => cumulativeScatter[bin].baryon),
          },
        },
      };

      return createCorsResponse(JSON.stringify(compressMetadata(metadata)), {
        status: 200,
      });
    } catch (error) {
      console.error("ERROR_GENERATING_BALANCES:", error);
      return createCorsResponse("Error generating balances", { status: 500 });
    }
  }

  /// Make a prediction (deposit)
  if (request.method === "POST" && path === "/predict") {
    try {
      const {
        prediction,
        wallet,
        anti,
        pro,
        baryon,
        photon,
        signature,
        timestamp,
      } = await request.json();

      if (!wallet || !signature || !prediction) {
        return createCorsResponse("Missing required parameters", {
          status: 400,
        });
      }

      if (
        isNaN(Number(anti)) ||
        isNaN(Number(pro)) ||
        isNaN(Number(baryon)) ||
        isNaN(Number(photon))
      ) {
        return createCorsResponse("Invalid token values", { status: 400 });
      }

      // Create event record
      const record = {
        anti: anti,
        pro: pro,
        baryon: baryon,
        photon: photon,
        wallet: wallet,
        signature: signature,
        timestamp: timestamp,
      };

      // Get existing events or create new object
      const events = JSON.parse((await KV.get(wallet)) || "{}");
      // Find the actual next index by getting the maximum existing index + 1
      const indices = Object.keys(events).map(Number);
      const nextIndex = indices.length > 0 ? Math.max(...indices) + 1 : 1;
      // Add new event with the correct next index
      events[nextIndex] = record;
      // Save the updated events
      await KV.put(wallet, JSON.stringify(events));

      // Update account balances
      const balancesKey = "balances_" + prediction;
      const balances = JSON.parse((await KV.get(balancesKey)) || "{}");

      if (!balances[wallet]) {
        balances[wallet] = {
          anti: 0,
          pro: 0,
          baryon: 0,
          photon: 0,
        };
      }

      balances[wallet].anti = anti;
      balances[wallet].pro = pro;
      balances[wallet].baryon = baryon;
      balances[wallet].photon = photon;

      await KV.put(balancesKey, JSON.stringify(balances));

      return createCorsResponse("Prediction recorded successfully", {
        status: 200,
      });
    } catch (error) {
      console.error("ERROR_HANDLING_PREDICTION:", error);
      return createCorsResponse("Invalid request", { status: 400 });
    }
  }

  /// Claim returns for a prediction (withdraw)
  if (request.method === "POST" && path === "/withdraw") {
    try {
      const {
        prediction,
        wallet,
        anti,
        pro,
        baryon,
        photon,
        signature,
        timestamp,
      } = await request.json();

      if (!wallet || !signature || !prediction) {
        return createCorsResponse("Missing required parameters", {
          status: 400,
        });
      }

      // Create event record
      const record = {
        anti: anti,
        pro: pro,
        baryon: baryon,
        photon: photon,
        wallet: wallet,
        signature: signature,
        timestamp: timestamp,
      };

      // Get existing events or create new object
      const events = JSON.parse((await KV.get(wallet)) || "{}");
      // Find the actual next index by getting the maximum existing index + 1
      const indices = Object.keys(events).map(Number);
      const nextIndex = indices.length > 0 ? Math.max(...indices) + 1 : 1;
      // Add new withdrawal with index
      events[nextIndex] = record;
      // Save the updated withdrawals
      await KV.put(wallet, JSON.stringify(events));

      // Update account balances
      const withdrawalsKey = "withdrawals";
      const withdrawals = JSON.parse((await KV.get(withdrawalsKey)) || "{}");

      if (!withdrawals[wallet]) {
        withdrawals[wallet] = {
          anti: 0,
          pro: 0,
          baryon: 0,
          photon: 0,
        };
      }

      withdrawals[wallet].anti = anti;
      withdrawals[wallet].pro = pro;
      withdrawals[wallet].baryon = baryon;
      withdrawals[wallet].photon = photon;

      await KV.put(withdrawalsKey, JSON.stringify(withdrawals));

      return createCorsResponse("Withdrawal recorded successfully", {
        status: 200,
      });
    } catch (error) {
      console.error("ERROR_HANDLING_WITHDRAWAL:", error);
      return createCorsResponse("Invalid request", { status: 400 });
    }
  }

  /// Query balance for a specific wallet and prediction
  if (request.method === "GET" && path.startsWith("/balance/")) {
    const prediction = path.split("/")[2];
    const wallet = path.split("/")[3];
    let accounts;
    if (Number(prediction) >= 0) {
      accounts = JSON.parse((await KV.get("balances_" + prediction)) || "{}");
    } else if (Number(prediction) === 0) {
      // Get list of all balances_* and add them up
      const keyList = await KV.list({ prefix: "balances_" });
      accounts = {};

      // Fetch and combine all balances
      for (const key of keyList.keys) {
        // Access the keys array from the returned object
        const balances = JSON.parse((await KV.get(key.name)) || "{}"); // Use key.name to get the actual key string

        // Add this prediction's balances to the total
        if (balances[wallet]) {
          accounts[wallet] = accounts[wallet] || {
            anti: 0,
            pro: 0,
            baryon: 0,
            photon: 0,
          };

          accounts[wallet].anti += balances[wallet].anti || 0;
          accounts[wallet].pro += balances[wallet].pro || 0;
          accounts[wallet].baryon += balances[wallet].baryon || 0;
          accounts[wallet].photon += balances[wallet].photon || 0;
        }
      }
    } else {
      accounts = {};
    }
    const balance = accounts[wallet] || {
      anti: 0,
      pro: 0,
      baryon: 0,
      photon: 0,
    };
    return createCorsResponse(JSON.stringify(balance), { status: 200 });
  }

  /// Query withdrawals for a specific wallet and prediction
  if (request.method === "GET" && path.startsWith("/withdrawal/")) {
    const prediction = path.split("/")[2];
    const wallet = path.split("/")[3];
    let accounts;
    if (Number(prediction) >= 0) {
      accounts = JSON.parse(
        (await KV.get("withdrawals_" + prediction)) || "{}"
      );
    } else if (Number(prediction) === 0) {
      // Get list of all withdrawals_* and add them up
      const keyList = await KV.list({ prefix: "withdrawals_" });
      accounts = {};

      // Fetch and combine all withdrawals
      for (const key of keyList.keys) {
        // Access the keys array from the returned object
        const withdrawals = JSON.parse((await KV.get(key.name)) || "{}"); // Use key.name to get the actual key string

        // Add this prediction's withdrawals to the total
        if (withdrawals[wallet]) {
          accounts[wallet] = accounts[wallet] || {
            anti: 0,
            pro: 0,
            baryon: 0,
            photon: 0,
          };

          accounts[wallet].anti += withdrawals[wallet].anti || 0;
          accounts[wallet].pro += withdrawals[wallet].pro || 0;
          accounts[wallet].baryon += withdrawals[wallet].baryon || 0;
          accounts[wallet].photon += withdrawals[wallet].photon || 0;
        }
      }
    } else {
      accounts = {};
    }
    const balance = accounts[wallet] || {
      anti: 0,
      pro: 0,
      baryon: 0,
      photon: 0,
    };

    return createCorsResponse(JSON.stringify(balance), { status: 200 });
  }

  /// Add a new prediction
  if (request.method === "POST" && path === "/add") {
    try {
      const {
        prediction,
        title,
        description,
        schedule,
        wallet,
        signature,
        timestamp,
      } = await request.json();

      if (!wallet || !signature || !prediction) {
        return createCorsResponse("Missing required parameters", {
          status: 400,
        });
      }

      // Check if wallet has submitted in the last 24 hours
      const walletSubmissions = await KV.get(wallet);
      if (walletSubmissions) {
        const submissions = JSON.parse(walletSubmissions);
        const recentSubmission = Object.values(submissions).find(
          (submission) => {
            const submissionTime = new Date(submission.timestamp).getTime();
            const currentTime = new Date().getTime();
            const hoursDiff = (currentTime - submissionTime) / (1000 * 60 * 60);
            return hoursDiff < 24;
          }
        );

        if (recentSubmission) {
          return createCorsResponse(
            "You can only submit one prediction every 24 hours",
            {
              status: 202,
            }
          );
        }
      }

      // Create event record
      const record = {
        prediction,
        title,
        description,
        schedule,
        wallet,
        signature,
        timestamp,
      };

      // Get existing events or create new object
      const events = JSON.parse((await KV.get("predictions")) || "{}");
      // Find the next index
      const nextIndex = Object.keys(events).length + 1;
      // Add new event with index
      events[nextIndex] = record;

      // Save to both the predictions collection and wallet-specific records
      await Promise.all([
        KV.put("predictions", JSON.stringify(events)),
        KV.put(
          wallet,
          JSON.stringify({
            [nextIndex]: record,
          })
        ),
      ]);

      return createCorsResponse("New prediction added", { status: 200 });
    } catch (error) {
      console.error("ERROR_HANDLING_NEW_POLL:", error);
      return createCorsResponse("Invalid request", { status: 400 });
    }
  }

  /// pre-check before adding a new prediction
  if (request.method === "GET" && path.startsWith("/check/")) {
    try {
      const wallet = path.split("/")[2];

      if (!wallet) {
        return createCorsResponse("Missing required parameters", {
          status: 400,
        });
      }

      // Get all predictions
      const predictions = JSON.parse((await KV.get("predictions")) || "{}");

      // Check if wallet has any previous predictions
      const hasPreviousPrediction = Object.values(predictions).some(
        (prediction) => prediction.wallet === wallet
      );

      if (hasPreviousPrediction) {
        return createCorsResponse("NOT_ALLOWED", {
          status: 202,
        });
      }

      return createCorsResponse("ALLOWED", { status: 200 });
    } catch (error) {
      console.error("ERROR_HANDLING_CHECK:", error);
      return createCorsResponse("Invalid request", { status: 400 });
    }
  }

  /// Catch-all return
  return createCorsResponse("NOT_FOUND", { status: 404 });
}

/// Helpder to create valid CORD response with headers
function createCorsResponse(body, init = {}, ORIGINS = []) {
  const headers = new Headers(init.headers || {});
  // Get the request origin from init or default to '*'
  const origin = init.origin || "*";
  // Set Access-Control-Allow-Origin based on allowed origins
  if (ORIGINS.length === 0 || ORIGINS.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  } else {
    headers.set("Access-Control-Allow-Origin", ORIGINS[0]); // Default to first allowed origin
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Content-Type", "application/json");

  // Get status from init or default to 200
  const status = init.status || 200;

  const content =
    typeof body === "string"
      ? JSON.stringify({ message: body, status: status })
      : JSON.stringify({ ...body, status: status });

  return new Response(content, { ...init, headers });
}

/// Helper for CORS pre-flight
function handleCorsPreflight(request = {}, ORIGINS = []) {
  const headers = new Headers();
  // Get the request origin from the OPTIONS request
  const origin = request.headers.get("Origin") || "*";
  // Set Access-Control-Allow-Origin based on allowed origins
  if (ORIGINS.length === 0 || ORIGINS.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  } else {
    headers.set("Access-Control-Allow-Origin", ORIGINS[0]); // Default to first allowed origin
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400"); // Cache for 1 day
  return new Response(null, { status: 204, headers });
}
