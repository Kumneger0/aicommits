import { execa } from "execa";
import { handleCliError } from './error.js';

export async function getCommitMessages(
	commitId: string,
	endingID?: string | null,
	currentUserOnly: boolean = false
) {
	const range = endingID ? `${commitId}..${endingID}` : `${commitId}^..HEAD`;
	const args = ['log', range, '--pretty=format:%s'];

	if (currentUserOnly) {
		try {
			const { stdout: email } = await execa('git', ['config', 'user.email']);
			const authorEmail = email.trim();
			args.push(`--author=${authorEmail}`);
		} catch (error) {
			handleCliError(error);
		}
	}

	const { stdout: msgs } = await execa('git', args);

	return msgs;
}
