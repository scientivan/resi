import { loadFont as loadDisplay } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadSans } from "@remotion/google-fonts/HankenGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";

loadDisplay("normal", { weights: ["600", "700"], subsets: ["latin"] });
loadSans("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });
