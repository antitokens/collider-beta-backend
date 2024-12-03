addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request));
  });
  
  const KV = YOUR_KV_BINDING;
  
  async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;
  
    if (request.method === "POST" && path === "/vote") {
      const { walletAddress, option } = await request.json();
      const hasVoted = await KV.get(walletAddress);
  
      if (hasVoted) {
        return new Response("You have already voted.", { status: 400 });
      }
  
      await KV.put(walletAddress, option);
      return new Response("Vote recorded successfully", { status: 200 });
    }
  
    if (request.method === "GET" && path.startsWith("/check/")) {
      const walletAddress = path.split("/")[2];
      const vote = await KV.get(walletAddress);
      return new Response(JSON.stringify({ hasVoted: !!vote }), { status: 200 });
    }
  
    return new Response("Not found", { status: 404 });
  }
  