/**
 * Metadata compression utilities
 */

const compressMetadata = (metadata) => {
  if (!metadata) return null;

  // Helper function to compress numbers to 4 decimals
  const compressNumber = (num) => Math.round(num * 10000) || 0;

  // Helper to compress arrays of numbers
  const compressArray = (arr) => arr.map(compressNumber);

  // Deep clone to avoid mutations
  const compressed = {
    t: {
      // time
      s: metadata.startTime,
      e: metadata.endTime,
    },
    c: {
      // collider
      u: compressNumber(metadata.colliderDistribution.u),
      s: compressNumber(metadata.colliderDistribution.s),
    },
    d: {
      // distribution
      u: compressNumber(metadata.totalDistribution.u),
      s: compressNumber(metadata.totalDistribution.s),
      b: {
        // bags
        p: compressArray(metadata.totalDistribution.bags.pro),
        a: compressArray(metadata.totalDistribution.bags.anti),
        h: compressArray(metadata.totalDistribution.bags.photon),
        b: compressArray(metadata.totalDistribution.bags.baryon),
      },
      w: metadata.totalDistribution.wallets, // wallets don't need compression
    },
    e: {
      // emissions
      t: compressNumber(metadata.emissionsData.total),
      b: compressNumber(metadata.emissionsData.baryonTokens),
      p: compressNumber(metadata.emissionsData.photonTokens),
    },
    l: {
      // collisions
      t: compressNumber(metadata.collisionsData.total),
      a: compressNumber(metadata.collisionsData.antiTokens),
      p: compressNumber(metadata.collisionsData.proTokens),
    },
    o: {
      // events over time
      t: metadata.eventsOverTime.timestamps,
      e: {
        p: compressArray(metadata.eventsOverTime.events.pro),
        a: compressArray(metadata.eventsOverTime.events.anti),
        h: compressArray(metadata.eventsOverTime.events.photon),
        b: compressArray(metadata.eventsOverTime.events.baryon),
      },
      r: {
        p: metadata.eventsOverTime.ranges.pro,
        a: metadata.eventsOverTime.ranges.anti,
        h: metadata.eventsOverTime.ranges.photon,
        b: metadata.eventsOverTime.ranges.baryon,
      },
      c: {
        t: metadata.eventsOverTime.cumulative.timestamps,
        p: compressArray(metadata.eventsOverTime.cumulative.pro),
        a: compressArray(metadata.eventsOverTime.cumulative.anti),
        h: compressArray(metadata.eventsOverTime.cumulative.photon),
        b: compressArray(metadata.eventsOverTime.cumulative.baryon),
      },
    },
  };

  return compressed;
};

export { compressMetadata };
