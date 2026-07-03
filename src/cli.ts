#!/usr/bin/env node
import { buildProgram } from "./commands.js";
import { handleParseFailure } from "./cli-runtime.js";

buildProgram().parseAsync(process.argv).catch(handleParseFailure);
