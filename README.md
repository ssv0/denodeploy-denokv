# denodeploy-denokv
Experimental earthstar server to be used with sneakspeak (or any es5 app that does not use attachments) that can be deployed and configured by denodeploy (https://deno.land) which has a free tier. It works with self hosted deno instances too, as long as the --unstable flag is used when running.

## Limitations
All data is stored in a single denokv entry, which soon probably triggers memory limits. Attachments are stored in memory, so they will be lost at each app spawn, which makes them unusable.

## To deploy
Clone this repo, on deno deploy START FROM AN EMPTY PROJECT (because you have to add the env variable before launching), link to your github clone, add the environmental variable SETTINGSSHARE containing the address of the share that contains the standard server settings, see earthstar or sneakspeak docs for info, and then launch.
