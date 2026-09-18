import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(4);

// The three Google fonts are fetched over the network when the first frame mounts, and 30s (the
// default) is not enough on a cold cache. Stills happened to squeak under it; a full render did not.
Config.setDelayRenderTimeoutInMilliseconds(120000);
