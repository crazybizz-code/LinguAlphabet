// Standalone diagnostic, not integrated anywhere. Does exactly one thing:
// a plain fetch of the confirmed share endpoint for one real article, to
// prove (or disprove) that the deployment runtime can retrieve it at all
// -- no provider, no parser, no pipeline, no Supabase, no RSS.
//
// Run: node scripts/check-conversation-share-endpoint.mjs

const URL = "https://theconversation.com/share/287611";

async function main() {
  const response = await fetch(URL);

  console.log(`status: ${response.status} ${response.statusText}`);

  console.log("\nresponse headers:");
  for (const [key, value] of response.headers.entries()) {
    console.log(`  ${key}: ${value}`);
  }

  const body = await response.text();
  console.log(`\nfirst 500 characters of body:`);
  console.log(body.slice(0, 500));
}

main().catch((error) => {
  console.log(`SCRIPT FAILED: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
