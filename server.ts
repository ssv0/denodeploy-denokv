const settingsShare = Deno.env.get("SETTINGSSHARE");
const listenToPort = Deno.env.get("PORT");
import * as Earthstar from "https://deno.land/x/earthstar/mod.ts";

new Earthstar.Server([
	new Earthstar.ExtensionServerSettings({
		settingsShare: settingsShare,
		onCreateReplica: (address) => {
			console.log(`Creating replica for ${address}...`);

			return new Earthstar.Replica({
				driver: new Earthstar.ReplicaDriverMemory(address),
			});
		},
	}),  new Earthstar.ExtensionSyncWeb(),
],{ port: listenToPort }
);
