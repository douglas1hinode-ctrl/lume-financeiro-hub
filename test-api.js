const apiUrl = "https://painel.best/api.php";
const apiKey = "vkutkHDffmDmroO3_IM7WZEW8tEytCxlRqrG-vze2Xs";

async function testApi(action) {
  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ key: apiKey, action })
  });
  console.log(`Action: ${action}`);
  const text = await resp.text();
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2).substring(0, 500));
  } catch (e) {
    console.log(text.substring(0, 200));
  }
  console.log("-------------------");
}

async function main() {
  await testApi("balance");
  await testApi("users");
  await testApi("resellers");
}

main();
