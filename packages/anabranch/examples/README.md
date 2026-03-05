# Examples

Read and process files (uses flatMap to emit multiple metrics per file):

```bash
deno run --allow-read examples/read_process_files.ts ./some-directory
```

Push-based stream source (Channel for external producers):

```bash
deno run examples/ticker.ts
```

Make web requests:

```bash
deno run --allow-net examples/web_request.ts
```

More steps with errors, filtering, and aggregation:

```bash
deno run --allow-read examples/process_and_report.ts ./some-directory
```

More steps with web requests and recovery:

```bash
deno run --allow-net examples/web_pipeline.ts
```
