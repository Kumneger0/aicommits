<div align="center">
  <div>
    <img src=".github/screenshot.png" alt="AI Commits"/>
    <h1 align="center">AI Commits</h1>
  </div>
	<p>A CLI that writes your git commit messages for you with AI. Never write a commit message again.</p>
	<a href="https://www.npmjs.com/package/aicg"><img src="https://img.shields.io/npm/v/aicg" alt="Current version"></a>
</div>

---

## Setup

> The minimum supported version of Node.js is the latest v14. Check your Node.js version with `node --version`.

1. Install _aicg_:

   ```sh
   npm install -g aicg
   ```

2. Retrieve your API key from [GROQ](https://console.groq.com/keys)- `--title <title>`: Custom title for the pull request. If not provided, a default title will be generated.

   > Note: If you haven't already, you'll have to create an account and set up billing.

3. Set the key so aicg can use it:

   ```sh
   aicg config set GROQ_API_KEY=<your token>
   ```

   This will create a `.aicg` file in your home directory.

### Upgrading

Check the installed version with:

```
aicg --version
```

If it's not the [latest version](https://github.com/Kumneger0/aicommits/releases/latest), run:

```sh
npm update -g aicg
```

## Usage

### CLI mode

You can call `aicg` directly to generate a commit message for your staged changes:

```sh
git add <files...>
aicg
```

`aicg` passes down unknown flags to `git commit`, so you can pass in [`commit` flags](https://git-scm.com/docs/git-commit).

For example, you can stage all changes in tracked files with as you commit:

```sh
aicg --all # or -a
```

> 👉 **Tip:** Use the `aic` alias if `aicg` is too long for you.

#### Generate multiple recommendations

Sometimes the recommended commit message isn't the best so you want it to generate a few to pick from. You can generate multiple commit messages at once by passing in the `--generate <i>` flag, where 'i' is the number of generated messages:

```sh
aicg --generate <i> # or -g <i>
```

> Warning: this uses more tokens, meaning it costs more.

#### Generating Conventional Commits

If you'd like to generate [Conventional Commits](https://conventionalcommits.org/), you can use the `--type` flag followed by `conventional`. This will prompt `aicg` to format the commit message according to the Conventional Commits specification:

```sh
aicg --type conventional # or -t conventional
```

This feature can be useful if your project follows the Conventional Commits standard or if you're using tools that rely on this commit format.

### Git hook

You can also integrate _aicg_ with Git via the [`prepare-commit-msg`](https://git-scm.com/docs/githooks#_prepare_commit_msg) hook. This lets you use Git like you normally would, and edit the commit message before committing.

#### Install

In the Git repository you want to install the hook in:

```sh
aicg hook install
```

#### Uninstall

In the Git repository you want to uninstall the hook from:

```sh
aicg hook uninstall
```

#### Usage

1. Stage your files and commit:

   ```sh
   git add <files...>
   git commit # Only generates a message when it's not passed in
   ```

   > If you ever want to write your own message instead of generating one, you can simply pass one in: `git commit -m "My message"`

2. aicg will generate the commit message for you and pass it back to Git. Git will open it with the [configured editor](https://docs.github.com/en/get-started/getting-started-with-git/associating-text-editors-with-git) for you to review/edit it.

3. Save and close the editor to commit!

## Configuration

### Reading a configuration value

To retrieve a configuration option, use the command:

```sh
aicg config get <key>
```

For example, to retrieve the API key, you can use:

```sh
aicg config get GROQ_API_KEY
```

You can also retrieve multiple configuration options at once by separating them with spaces:

```sh
aicg config get GROQ_API_KEY generate
```

### Setting a configuration value

To set a configuration option, use the command:

```sh
aicg config set <key>=<value>
```

For example, to set the API key, you can use:

```sh
aicg config set GROQ_API_KEY=<your-api-key>
```

You can also set multiple configuration options at once by separating them with spaces, like

```sh
aicg config set GROQ_API_KEY=<your-api-key> generate=3 locale=en
```

### Options

#### GROQ_API_KEY

Required

The GROQ API key. You can retrieve it from [GROQ API Keys page](https://console.groq.com/keys).

#### locale

Default: `en`

The locale to use for the generated commit messages. Consult the list of codes in: https://wikipedia.org/wiki/List_of_ISO_639-1_codes.

#### generate

Default: `1`

The number of commit messages to generate to pick from.

Note, this will use more tokens as it generates more results.

#### proxy

Set a HTTP/HTTPS proxy to use for requests.

To clear the proxy option, you can use the command (note the empty value after the equals sign):

```sh
aicg config set proxy=
```

#### model

Default: `mixtral-8x7b-32768`

Use the following command to select different models with aicg and save the selection:

```sh
aicg models select
```

This command configures and saves your selection so when you run aicg next time, it will use the selected model.

Alternatively, you can override the selected model for a specific time using:

```sh
aicg -k <model-id>
```

#### timeout

The timeout for network requests in milliseconds.

Default: `10000` (10 seconds)

```sh
aicg config set timeout=20000 # 20s
```

#### max-length

The maximum character length of the generated commit message.

Default: `50`

```sh
aicg config set max-length=100
```

#### type

Default: `""` (Empty string)

The type of commit message to generate. Set this to "conventional" to generate commit messages that follow the Conventional Commits specification:

```sh
aicg config set type=conventional
```

You can clear this option by setting it to an empty string:

```sh
aicg config set type=
```

#### PRGen

##### Usage

You can call `aicg prgen` to generate a pull request description based on your commit messages:
The generated pull request description and title are saved in a JSON file located at `.aicg/pr.json`. This allows you to easily access, review, and edit the generated content before submitting your pull request.

- `--from <commit-id>`: (Required) Specify the starting commit.
- `--to <commit-id>`: Specify the ending commit (default: latest commit).
- `--current-user-only` or `-u`: Filter commits for the current user only (default: false).

```sh
aicg prgen --from <commit-id> [--to <commit-id>] [--current-user-only]
````


Examples:

1. Generate PR description for all commits from a specific commit (default behavior):
   ```sh
   aicg prgen --from abc123
   ```

2. Generate PR description for commits between two specific commits:
   ```sh
   aicg prgen --from abc123 --to def456
   ```

3. Generate PR description for only the current user's commits from a specific commit:
   ```sh
   aicg prgen --from abc123 --current-user-only
   ```

4. Using the short alias for current user only:
   ```sh
   aicg prgen --from abc123 -u
   ```

Note: The `--from` flag is required. By default, `aicg prgen` includes commits from all users. Use the `--current-user-only` or `-u` flag to filter commits for the current user only.

## How it works

This CLI tool runs `git diff` to grab all your latest code changes, sends them to GROQ, then returns the AI generated commit message.

Video coming soon where I rebuild it from scratch to show you how to easily build your own CLI tools powered by AI.

## Maintainers

- **Hassan El Mghari**: [@Nutlope](https://github.com/Nutlope) [<img src="https://img.shields.io/twitter/follow/nutlope?style=flat&label=nutlope&logo=twitter&color=0bf&logoColor=fff" align="center">](https://twitter.com/nutlope)

- **Hiroki Osame**: [@privatenumber](https://github.com/privatenumber) [<img src="https://img.shields.io/twitter/follow/privatenumbr?style=flat&label=privatenumbr&logo=twitter&color=0bf&logoColor=fff" align="center">](https://twitter.com/privatenumbr)

## Contributing

If you want to help fix a bug or implement a feature in [Issues](https://github.com/Nutlope/aicg/issues), checkout the [Contribution Guide](CONTRIBUTING.md) to learn how to setup and test the project
