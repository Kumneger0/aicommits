import { describe } from 'manten';

describe('aicg', ({ runTestSuite }) => {
	runTestSuite(import('./specs/cli/index.js'));
	runTestSuite(import('./specs/openai/index.js'));
	runTestSuite(import('./specs/config.js'));
	runTestSuite(import('./specs/git-hook.js'));
});
