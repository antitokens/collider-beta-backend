const KV = Antitoken_Collider_Beta;

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    // Handle CORS preflight requests
    return handleCorsPreflight();
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

      // Check if the wallet has already voted
      /*
      const existingVote = await KV.get(wallet);
      if (existingVote) {
        return createCorsResponse("You have already voted", { status: 400 });
      }
      */

      // Create vote record
      const voteRecord = {
        anti: antiTokens,
        pro: proTokens,
        baryon: baryonTokens,
        photon: photonTokens,
        wallet: wallet,
        signature: signature,
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
      } = await request.json();

      if (!wallet || !signature) {
        return createCorsResponse("Missing required parameters", {
          status: 400,
        });
      }

      // Check if the wallet has already voted
      /*
      const existingVote = await KV.get(wallet);
      if (existingVote) {
        return createCorsResponse("You have already voted", { status: 400 });
      }
      */

      // Create vote record
      const claimRecord = {
        anti: -antiTokens,
        pro: -proTokens,
        baryon: -baryonTokens,
        photon: -photonTokens,
        wallet: wallet,
        signature: signature,
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

  /*
  if (request.method === "GET" && path.startsWith("/check/")) {
    const wallet = path.split("/")[2];
    if (!wallet) {
      return createCorsResponse("Missing wallet address", { status: 400 });
    }

    const existingVote = await KV.get(wallet);
    return createCorsResponse(JSON.stringify({ hasVoted: !!existingVote }), {
      status: 200,
    });
  }
  */

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
