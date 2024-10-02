import { execa } from "execa";

export async function getCommitMessages(commitId: string, endingID?: string | null) {
	const range = endingID ? `${commitId}..${endingID}` : `${commitId}^..HEAD`;

	const args = ["log", range, "--pretty=format:%s"];

	const { stdout: msgs } = await execa('git', args);

	return msgs;
}
