import { execa } from 'execa';
import { KnownError } from './error.js';

export const assertGitRepo = async () => {
	const { stdout, failed } = await execa(
		'git',
		['rev-parse', '--show-toplevel'],
		{ reject: false }
	);

	if (failed) {
		throw new KnownError('The current directory must be a Git repository!');
	}

	return stdout;
};

const excludeFromDiff = (path: string) => `:(exclude)${path}`;

const filesToExclude = [
	'package-lock.json',
	'pnpm-lock.yaml',

	// yarn.lock, Cargo.lock, Gemfile.lock, Pipfile.lock, etc.
	'*.lock',
].map(excludeFromDiff);

export const getStagedFileNamesOnly = async (
	diffCached: string[],
	excludeFiles?: string[]
) => {
	const { stdout: files } = await execa('git', [
		...diffCached,
		'--name-only',
		...filesToExclude,
		...(excludeFiles ? excludeFiles.map(excludeFromDiff) : []),
	]);
	return files;
};

export const getStagedDiff = async (excludeFiles?: string[]) => {
	const diffCached = ['diff', '--cached', '--diff-algorithm=minimal'];
	const files = await getStagedFileNamesOnly(diffCached, excludeFiles);

	if (!files) {
		return;
	}

	const { stdout: diff } = await execa('git', [
		...diffCached,
		...filesToExclude,
		...(excludeFiles ? excludeFiles.map(excludeFromDiff) : []),
	]);

	return {
		files: files.split('\n'),
		diff,
	};
};

export const getStagedDiffForEachFileSeparately = async (
	excludeFiles?: string[]
) => {
	const diffCached = ['diff', '--cached', '--diff-algorithm=minimal'];
	const files = await getStagedFileNamesOnly(diffCached, excludeFiles);

	if (!files) {
		return [];
	}

	const stagedFilesArray = files.split('\n');

	const stagedDiffArr = await Promise.all(
		stagedFilesArray.map(async (file) => {
			const { stdout: diff } = await execa('git', [...diffCached, file]);
			return { filePath: file, diff };
		})
	);
	return stagedDiffArr;
};

export const getDetectedMessage = (files: string[]) =>
	`Detected ${files.length.toLocaleString()} staged file${
		files.length > 1 ? 's' : ''
	}`;
