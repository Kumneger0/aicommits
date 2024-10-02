import { execa } from "execa"

export async function getCommitMessages(commitId:string){
  const args = ["log", `${commitId}^..HEAD`, `--pretty=format:"%s"`]
  const {stdout:msgs} = await execa('git', [
		...args
	])
	return msgs
}
