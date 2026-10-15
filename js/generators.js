// Manifest generators. Pure functions: state in -> { name, language, content, warnings, assumptions, extra? } out.
// No credentials are ever requested. Everything uses placeholders and secret/environment references.

const cmdArray = (str) => {
  const out = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m;
  while ((m = re.exec(String(str || '').trim()))) out.push(m[1] ?? m[2] ?? m[3]);
  return JSON.stringify(out);
};
const names = (str) => String(str || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
const q = (v) => JSON.stringify(String(v));
const DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const SAFE_FILE = /^[\w.\- ]+$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function commonErrors(s, e, { port, portLabel = 'Port' } = {}) {
  if (port) {
    const p = Number(s[port]);
    if (!Number.isInteger(p) || p < 1 || p > 65535) e[port] = `${portLabel} must be a whole number from 1 to 65535.`;
  }
  if ('filename' in s && s.filename && !SAFE_FILE.test(s.filename)) e.filename = 'Use letters, numbers, dots, dashes or underscores only. No slashes.';
}
function checkEnvNames(s, key, e) {
  const bad = names(s[key]).filter((n) => !ENV_NAME.test(n));
  if (bad.length) e[key] = `Invalid variable name: ${bad[0]}. Use letters, digits and underscores, not starting with a digit.`;
}

/* ------------------------------------------------------------------ DOCKERFILE */
const DF = {
  node: { label: 'Node.js', versions: ['22', '20', '18'], pms: [['npm', 'npm'], ['pnpm', 'pnpm'], ['yarn', 'yarn']], port: 3000, start: 'node server.js' },
  python: { label: 'Python', versions: ['3.13', '3.12', '3.11'], pms: [['requirements', 'pip + requirements.txt'], ['pyproject', 'pip + pyproject.toml']], port: 8000, start: 'python app.py' },
  java: { label: 'Java', versions: ['21', '17'], pms: [['maven', 'Maven'], ['gradle', 'Gradle']], port: 8080, start: 'java -jar app.jar' },
  go: { label: 'Go', versions: ['1.23', '1.22'], pms: [['mod', 'Go modules']], port: 8080, start: '/app' },
  nginx: { label: 'Nginx (static site)', versions: ['1.27', '1.26'], pms: [['none', 'No package manager']], port: 80, start: '' },
  custom: { label: 'Custom image', versions: ['custom'], pms: [['none', 'Not applicable']], port: 8080, start: '' }
};

function dockerfileFields() {
  const rt = (s) => s.runtime;
  return [
    { id: 'project', label: 'Project name', type: 'text', req: true, hint: 'Used in comments and the image label.' },
    { id: 'runtime', label: 'Base image / runtime', type: 'select', options: Object.entries(DF).map(([k, v]) => [k, v.label]) },
    { id: 'customImage', label: 'Custom base image', type: 'text', show: (s) => rt(s) === 'custom', hint: 'Example: ruby:3.3-slim. Custom output needs manual validation.' },
    { id: 'version', label: 'Version', type: 'select', show: (s) => rt(s) !== 'custom', options: (s) => [...DF[rt(s)].versions.map((v) => [v, v]), ['custom', 'Custom tag…']], hint: 'Pin a version. "latest" can change under you without warning.' },
    { id: 'versionCustom', label: 'Custom version tag', type: 'text', show: (s) => rt(s) !== 'custom' && s.version === 'custom', hint: 'Check the tag exists on Docker Hub.' },
    { id: 'pm', label: 'Package manager / build tool', type: 'select', show: (s) => DF[rt(s)].pms.length > 1, options: (s) => DF[rt(s)].pms },
    { id: 'workdir', label: 'Working directory', type: 'text', req: true, hint: 'Absolute path inside the container.' },
    { id: 'startCmd', label: 'Start command', type: 'text', show: (s) => rt(s) !== 'nginx', req: true, hint: 'Example: node server.js. Split into words; quotes are respected.' },
    { id: 'buildCmd', label: 'Build command (multi-stage only)', type: 'text', show: (s) => rt(s) === 'node' && s.multistage, hint: 'Runs in the build stage. Example: npm run build.' },
    { id: 'buildOutput', label: 'Build output folder to keep', type: 'text', show: (s) => rt(s) === 'node' && s.multistage, hint: 'Copied into the final image. Example: dist.' },
    { id: 'jarPath', label: 'Path to built .jar file', type: 'text', show: (s) => rt(s) === 'java' && !s.multistage, hint: 'Example: target/app.jar. Build it before docker build.' },
    { id: 'goPkg', label: 'Go package to build', type: 'text', show: (s) => rt(s) === 'go', hint: 'Use . for the root package or ./cmd/server.' },
    { id: 'staticDir', label: 'Static site folder to copy', type: 'text', show: (s) => rt(s) === 'nginx', hint: 'Example: dist or build. Must exist before docker build.' },
    { id: 'port', label: 'Application port (editable)', type: 'number', req: true, hint: 'EXPOSE documents the container port. It does not publish it; use -p or Compose ports.' },
    { id: 'copy', label: 'Copy my source files into the image', type: 'checkbox' },
    { id: 'env', label: 'Environment variable names', type: 'text', hint: 'Names only, separated by commas. Never enter real values or secrets.' },
    { id: 'healthcheck', label: 'Add a health check', type: 'checkbox', show: (s) => rt(s) !== 'custom' },
    { id: 'healthPath', label: 'Health check path', type: 'text', show: (s) => s.healthcheck && rt(s) !== 'custom', hint: 'Example: /health' },
    { id: 'nonroot', label: 'Run as a non-root user (recommended)', type: 'checkbox' },
    { id: 'multistage', label: 'Use a multi-stage build', type: 'checkbox', show: (s) => ['node', 'python', 'java', 'go'].includes(rt(s)) },
    { id: 'filename', label: 'Output file name', type: 'text', req: true }
  ];
}
function dockerfileDefaults(rt = 'node') {
  const d = DF[rt];
  return { runtime: rt, version: d.versions[0], versionCustom: '', pm: d.pms[0][0], port: String(d.port), startCmd: d.start,
    workdir: rt === 'nginx' ? '/usr/share/nginx/html' : '/app', buildCmd: 'npm run build', buildOutput: 'dist', jarPath: 'target/app.jar', goPkg: '.', staticDir: 'dist',
    copy: true, healthcheck: false, healthPath: '/health', nonroot: true, multistage: rt === 'go', customImage: '' };
}
function dockerfileState() { return { project: 'my-app', env: 'PORT, NODE_ENV', filename: 'Dockerfile', ...dockerfileDefaults('node') }; }
function dockerfileChange(id, s) {
  if (id === 'runtime') {
    const keepProject = s.project; const env = s.env; const fn = s.filename;
    Object.assign(s, dockerfileDefaults(s.runtime), { project: keepProject, env, filename: fn });
  }
}
function dockerfileValidate(s) {
  const e = {}; commonErrors(s, e, { port: 'port', portLabel: 'Application port' });
  if (!String(s.project || '').trim()) e.project = 'Enter a project name.';
  if (!String(s.workdir || '').startsWith('/')) e.workdir = 'Use an absolute path that starts with /.';
  if (s.runtime !== 'nginx' && !String(s.startCmd || '').trim()) e.startCmd = 'Enter the command that starts your app.';
  if (s.runtime === 'custom' && !String(s.customImage || '').trim()) e.customImage = 'Enter a base image.';
  if (s.version === 'custom' && s.runtime !== 'custom' && !String(s.versionCustom || '').trim()) e.versionCustom = 'Enter a version tag.';
  if (!String(s.filename || '').trim()) e.filename = 'Enter a file name.';
  checkEnvNames(s, 'env', e);
  return e;
}
function dockerfileGenerate(s) {
  const w = []; const a = []; const L = [];
  const rt = s.runtime; const ver = s.version === 'custom' ? s.versionCustom : s.version;
  const wd = s.workdir; const port = Number(s.port); const hp = s.healthPath || '/health';
  const env = names(s.env);
  const header = [`# ${s.project} — generated by DevOps Master`, '# Review before use. Build with: docker build -t ' + String(s.project).toLowerCase().replace(/[^a-z0-9._-]/g, '-') + ' .'];
  const envComment = env.length ? ['# Runtime environment variables expected (provide at run time; never bake secrets into an image):', ...env.map((n) => `#   - ${n}`)] : [];
  const tail = (user, healthLines, cmdLine) => {
    if (envComment.length) L.push('', ...envComment);
    if (user) L.push('', user);
    L.push('', `EXPOSE ${port}`);
    if (healthLines) L.push('', ...healthLines);
    if (cmdLine) L.push('', cmdLine);
  };
  const hc = (cmd) => ['HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \\', `  CMD ${cmd}`];

  if (rt === 'node') {
    const inst = (prod) => s.pm === 'pnpm' ? `corepack enable && pnpm install --frozen-lockfile${prod ? ' --prod' : ''}` : s.pm === 'yarn' ? `yarn install --frozen-lockfile${prod ? ' --production' : ''}` : (prod ? 'npm ci --omit=dev' : 'npm ci');
    const manifests = s.pm === 'pnpm' ? 'package.json pnpm-lock.yaml' : s.pm === 'yarn' ? 'package.json yarn.lock' : 'package*.json';
    L.push(...header, '');
    if (s.multistage) {
      L.push(`FROM node:${ver}-alpine AS build`, `WORKDIR ${wd}`, `COPY ${manifests} ./`, `RUN ${inst(false)}`, 'COPY . .', `RUN ${s.buildCmd || 'npm run build'}`, '', `FROM node:${ver}-alpine AS runtime`, `WORKDIR ${wd}`, 'ENV NODE_ENV=production', `COPY ${manifests} ./`, `RUN ${inst(true)}`, `COPY --from=build --chown=node:node ${wd}/${s.buildOutput || 'dist'} ./${s.buildOutput || 'dist'}`);
      a.push('Multi-stage build assumes your build writes to "' + (s.buildOutput || 'dist') + '" and that the start command uses it.');
    } else {
      L.push(`FROM node:${ver}-alpine`, `WORKDIR ${wd}`, 'ENV NODE_ENV=production', `COPY ${manifests} ./`, `RUN ${inst(true)}`);
      if (s.copy) L.push(`COPY ${s.nonroot ? '--chown=node:node ' : ''}. .`);
    }
    tail(s.nonroot ? 'USER node' : '', s.healthcheck ? hc(`wget -qO- http://127.0.0.1:${port}${hp} || exit 1`) : null, `CMD ${cmdArray(s.startCmd)}`);
    a.push('Node lockfile (package-lock.json, pnpm-lock.yaml or yarn.lock) must exist next to the Dockerfile.');
    a.push('Production install skips devDependencies. If your start step needs them, adjust the install command.');
  } else if (rt === 'python') {
    L.push(...header, '');
    const copyDeps = s.pm === 'pyproject' ? ['COPY . .'] : ['COPY requirements.txt ./'];
    const install = s.pm === 'pyproject' ? 'pip install --no-cache-dir .' : 'pip install --no-cache-dir -r requirements.txt';
    if (s.multistage) {
      L.push(`FROM python:${ver}-slim AS build`, 'RUN python -m venv /opt/venv', 'ENV PATH="/opt/venv/bin:$PATH"', `WORKDIR ${wd}`, ...copyDeps, `RUN ${install}`, '', `FROM python:${ver}-slim`, 'ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH="/opt/venv/bin:$PATH"', `WORKDIR ${wd}`, 'COPY --from=build /opt/venv /opt/venv');
      if (s.copy) L.push(s.pm === 'pyproject' ? 'COPY . .' : `COPY ${s.nonroot ? '--chown=10001:10001 ' : ''}. .`);
    } else {
      L.push(`FROM python:${ver}-slim`, 'ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1', `WORKDIR ${wd}`, ...copyDeps, `RUN ${install}`);
      if (s.copy && s.pm !== 'pyproject') L.push(`COPY ${s.nonroot ? '--chown=10001:10001 ' : ''}. .`);
    }
    if (s.nonroot) L.push('RUN useradd --system --uid 10001 --no-create-home app');
    tail(s.nonroot ? 'USER 10001' : '', s.healthcheck ? hc(`python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${port}${hp}', timeout=3)"`) : null, `CMD ${cmdArray(s.startCmd)}`);
    a.push('Python images use -slim, which has no curl or wget. The health check uses Python itself.');
  } else if (rt === 'java') {
    L.push(...header, '');
    if (s.multistage) {
      if (s.pm === 'gradle') L.push(`FROM gradle:8-jdk${ver} AS build`, 'WORKDIR /build', 'COPY . .', 'RUN gradle build -x test --no-daemon');
      else L.push(`FROM maven:3.9-eclipse-temurin-${ver} AS build`, 'WORKDIR /build', 'COPY pom.xml .', 'RUN mvn -B -q dependency:go-offline', 'COPY src ./src', 'RUN mvn -B -q package -DskipTests');
      L.push('', `FROM eclipse-temurin:${ver}-jre`, `WORKDIR ${wd}`, s.pm === 'gradle' ? 'COPY --from=build /build/build/libs/*.jar app.jar' : 'COPY --from=build /build/target/*.jar app.jar');
      w.push('The *.jar wildcard must match exactly one file. If your build produces a "-plain" jar too, name the jar explicitly.');
    } else {
      L.push(`FROM eclipse-temurin:${ver}-jre`, `WORKDIR ${wd}`, `COPY ${s.jarPath || 'target/app.jar'} app.jar`);
    }
    if (s.nonroot) L.push('RUN useradd --system --uid 10001 --no-create-home app');
    tail(s.nonroot ? 'USER 10001' : '', s.healthcheck ? hc(`curl -fsS http://127.0.0.1:${port}${hp} || exit 1`) : null, `CMD ${cmdArray(s.startCmd)}`);
    if (s.healthcheck) w.push('The Java health check uses curl. Confirm curl exists in the final image or switch to another check.');
  } else if (rt === 'go') {
    L.push(...header, '');
    if (s.multistage) {
      L.push(`FROM golang:${ver}-alpine AS build`, 'WORKDIR /src', 'COPY go.mod go.sum* ./', 'RUN go mod download', 'COPY . .', `RUN CGO_ENABLED=0 go build -o /out/app ${s.goPkg || '.'}`, '', 'FROM gcr.io/distroless/static-debian12:nonroot', 'COPY --from=build /out/app /app');
      tail('', null, `CMD ${cmdArray(s.startCmd || '/app')}`);
      a.push('The distroless final image has no shell, so no shell-based HEALTHCHECK is added. It already runs as a non-root user.');
      if (s.healthcheck) w.push('Health check skipped: distroless has no shell, wget or curl. Use an orchestrator probe (for example Kubernetes httpGet) instead.');
    } else {
      L.push(`FROM golang:${ver}-alpine`, `WORKDIR ${wd}`, 'COPY go.mod go.sum* ./', 'RUN go mod download', 'COPY . .', `RUN go build -o app ${s.goPkg || '.'}`);
      tail(s.nonroot ? 'RUN adduser -D -u 10001 app\nUSER app' : '', s.healthcheck ? hc(`wget -qO- http://127.0.0.1:${port}${hp} || exit 1`) : null, `CMD ${cmdArray(s.startCmd.replace(/^\/app$/, './app'))}`);
      w.push('Single-stage Go images are large because they include the compiler. Multi-stage is recommended.');
    }
  } else if (rt === 'nginx') {
    const unpriv = s.nonroot;
    L.push(...header, '', unpriv ? `FROM nginxinc/nginx-unprivileged:${ver}-alpine` : `FROM nginx:${ver}-alpine`, `COPY ${s.staticDir || 'dist'} /usr/share/nginx/html`);
    if (envComment.length) L.push('', ...envComment);
    L.push('', `EXPOSE ${port}`);
    if (s.healthcheck) L.push('', ...hc(`wget -qO- http://127.0.0.1:${port}${hp} || exit 1`));
    if (unpriv && port !== 8080) w.push('The unprivileged Nginx image listens on 8080 by default. Add a custom nginx.conf if you want port ' + port + '.');
    if (!unpriv && port !== 80) w.push('Official Nginx listens on port 80 by default. Add a custom nginx.conf (COPY nginx.conf /etc/nginx/conf.d/default.conf) to use port ' + port + '.');
    a.push('Build your site first (for example npm run build) so the static folder exists before docker build.');
  } else {
    L.push(...header, '', `FROM ${s.customImage}`, `WORKDIR ${wd}`);
    if (s.copy) L.push('COPY . .');
    tail('', null, s.startCmd ? `CMD ${cmdArray(s.startCmd)}` : '');
    w.push('Custom base image: this output is a generic starting point. Add the install and build steps your image needs and validate by building it.');
  }
  w.push('EXPOSE only documents the port. Publish it when running: docker run -p HOST:' + port + ' ...');
  if (s.copy) a.push('A .dockerignore file is strongly recommended (exclude node_modules, .git, .env and local logs).');
  return { name: s.filename, language: 'dockerfile', content: L.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', warnings: w, assumptions: a };
}

/* ------------------------------------------------------------------ COMPOSE */
const DBS = {
  none: null,
  postgres: { label: 'PostgreSQL', image: 'postgres', versions: ['17', '16', '15'], vol: '/var/lib/postgresql/data', port: 5432, env: (n) => [`POSTGRES_USER: \${DB_USER}`, `POSTGRES_PASSWORD: \${DB_PASSWORD}`, `POSTGRES_DB: \${DB_NAME}`], health: 'pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}', test: (h) => `["CMD-SHELL", ${q(h)}]` },
  mysql: { label: 'MySQL', image: 'mysql', versions: ['8.4', '8.0'], vol: '/var/lib/mysql', port: 3306, env: () => ['MYSQL_DATABASE: ${DB_NAME}', 'MYSQL_USER: ${DB_USER}', 'MYSQL_PASSWORD: ${DB_PASSWORD}', 'MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}'], health: 'mysqladmin ping -h 127.0.0.1 --silent', test: (h) => `["CMD-SHELL", ${q(h)}]` },
  mongo: { label: 'MongoDB', image: 'mongo', versions: ['8', '7'], vol: '/data/db', port: 27017, env: () => ['MONGO_INITDB_ROOT_USERNAME: ${DB_USER}', 'MONGO_INITDB_ROOT_PASSWORD: ${DB_PASSWORD}'], health: 'mongosh --quiet --eval "db.adminCommand(\'ping\').ok"', test: (h) => `["CMD-SHELL", ${q(h)}]` }
};
function composeFields() {
  return [
    { id: 'project', label: 'Project name', type: 'text', req: true, hint: 'Lowercase letters, digits, dashes and underscores.' },
    { id: 'appMode', label: 'App service source', type: 'select', options: [['build', 'Build from a Dockerfile in this folder'], ['image', 'Use an existing image']] },
    { id: 'appBuild', label: 'Build context', type: 'text', show: (s) => s.appMode === 'build', hint: 'Usually . (current folder).' },
    { id: 'appImage', label: 'App image', type: 'text', show: (s) => s.appMode === 'image', hint: 'Example: ghcr.io/acme/web:1.4.2' },
    { id: 'hostPort', label: 'Host port (your machine)', type: 'number', req: true },
    { id: 'appPort', label: 'Container port (your app listens on)', type: 'number', req: true },
    { id: 'appEnv', label: 'App environment variable names', type: 'text', hint: 'Names only. Values come from your .env file.' },
    { id: 'db', label: 'Database', type: 'select', options: Object.entries(DBS).map(([k, v]) => [k, v ? v.label : 'None']) },
    { id: 'dbVersion', label: 'Database version', type: 'text', show: (s) => s.db !== 'none', hint: 'Pin a version tag, for example 16.' },
    { id: 'dbPublish', label: 'Publish the database port to my machine', type: 'checkbox', show: (s) => s.db !== 'none', hint: 'Leave off unless you need to connect from the host.' },
    { id: 'cache', label: 'Add Redis cache', type: 'checkbox' },
    { id: 'network', label: 'Network name', type: 'text', req: true },
    { id: 'restart', label: 'Restart policy', type: 'select', options: [['unless-stopped', 'unless-stopped'], ['always', 'always'], ['on-failure', 'on-failure'], ['no', 'no']] },
    { id: 'health', label: 'Add health checks', type: 'checkbox' },
    { id: 'appHealthPath', label: 'App health check path', type: 'text', show: (s) => s.health, hint: 'Example: /health' },
    { id: 'filename', label: 'Output file name', type: 'select', options: [['compose.yaml', 'compose.yaml'], ['docker-compose.yml', 'docker-compose.yml']] }
  ];
}
const composeState = () => ({ project: 'my-stack', appMode: 'build', appBuild: '.', appImage: '', hostPort: '8080', appPort: '3000', appEnv: 'DATABASE_URL, NODE_ENV', db: 'postgres', dbVersion: '16', dbPublish: false, cache: false, network: 'app-net', restart: 'unless-stopped', health: true, appHealthPath: '/health', filename: 'compose.yaml' });
function composeChange(id, s) { if (id === 'db' && DBS[s.db]) s.dbVersion = DBS[s.db].versions[0]; }
function composeValidate(s) {
  const e = {}; commonErrors(s, e, { port: 'appPort', portLabel: 'Container port' });
  const hp = Number(s.hostPort); if (!Number.isInteger(hp) || hp < 1 || hp > 65535) e.hostPort = 'Host port must be a whole number from 1 to 65535.';
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(String(s.project || ''))) e.project = 'Use lowercase letters, digits, dashes and underscores; start with a letter or digit.';
  if (s.appMode === 'image' && !String(s.appImage || '').trim()) e.appImage = 'Enter an image name.';
  if (!/^[a-zA-Z0-9][\w.-]*$/.test(String(s.network || ''))) e.network = 'Enter a valid network name.';
  if (s.db !== 'none' && !String(s.dbVersion || '').trim()) e.dbVersion = 'Enter a database version.';
  checkEnvNames(s, 'appEnv', e);
  return e;
}
function composeGenerate(s) {
  const w = []; const a = []; const L = []; const extra = [];
  const db = DBS[s.db]; const appEnv = names(s.appEnv);
  const hasDb = !!db;
  L.push(`# ${s.project} — generated by DevOps Master`, '# Create a .env file next to this file (see .env.example). Never commit real secrets.', `name: ${s.project}`, 'services:', '  app:');
  L.push(s.appMode === 'build' ? `    build: ${s.appBuild || '.'}` : `    image: ${s.appImage}`);
  L.push('    ports:', `      - "${s.hostPort}:${s.appPort}"`);
  if (appEnv.length) {
    L.push('    environment:');
    appEnv.forEach((n) => L.push(`      ${n}: \${${n}}`));
  }
  const deps = [];
  if (hasDb) deps.push('db');
  if (s.cache) deps.push('cache');
  if (deps.length) {
    L.push('    depends_on:');
    deps.forEach((d) => { if (s.health) L.push(`      ${d}:`, '        condition: service_healthy'); else L.push(`      - ${d}`); });
  }
  L.push('    networks:', `      - ${s.network}`, `    restart: ${s.restart}`);
  if (s.health) L.push('    healthcheck:', `      test: ["CMD-SHELL", ${q(`wget -qO- http://127.0.0.1:${s.appPort}${s.appHealthPath || '/health'} || exit 1`)}]`, '      interval: 30s', '      timeout: 3s', '      retries: 3', '      start_period: 15s');
  if (hasDb) {
    L.push('  db:', `    image: ${db.image}:${s.dbVersion}`, '    environment:', ...db.env().map((x) => '      ' + x), '    volumes:', `      - db-data:${db.vol}`);
    if (s.dbPublish) L.push('    ports:', `      - "127.0.0.1:${db.port}:${db.port}"`);
    L.push('    networks:', `      - ${s.network}`, `    restart: ${s.restart}`);
    if (s.health) L.push('    healthcheck:', `      test: ${db.test(db.health)}`, '      interval: 10s', '      timeout: 5s', '      retries: 5', '      start_period: 20s');
  }
  if (s.cache) {
    L.push('  cache:', '    image: redis:7-alpine', '    networks:', `      - ${s.network}`, `    restart: ${s.restart}`);
    if (s.health) L.push('    healthcheck:', '      test: ["CMD", "redis-cli", "ping"]', '      interval: 10s', '      timeout: 3s', '      retries: 5');
  }
  if (hasDb) L.push('volumes:', '  db-data:');
  L.push('networks:', `  ${s.network}:`);
  let content = L.join('\n') + '\n';
  const envLines = ['# Copy to .env and fill in real values locally. Do not commit .env.', ...appEnv.map((n) => `${n}=`)];
  if (hasDb) envLines.push('DB_USER=app', 'DB_PASSWORD=<set-a-strong-password>', 'DB_NAME=appdb', ...(s.db === 'mysql' ? ['DB_ROOT_PASSWORD=<set-a-strong-password>'] : []));
  extra.push({ name: '.env.example', language: 'ini', content: envLines.join('\n') + '\n' });
  w.push('Passwords are not generated. Set them in your own .env file; compose reads ${VARIABLES} from it.');
  if (s.health) w.push('App health check uses wget. Make sure it exists in your app image, or change the test command.');
  if (!s.dbPublish && hasDb) a.push('The database port is not published; only the app can reach it on the Compose network.');
  a.push('Run with: docker compose up -d   Stop with: docker compose down (add -v only if you want to delete the database volume).');
  if (appEnv.includes('DATABASE_URL') && hasDb) a.push('Build DATABASE_URL yourself using the service name "db" as the host.');
  return { name: s.filename, language: 'yaml', content, warnings: w, assumptions: a, extra };
}

/* ------------------------------------------------------------------ KUBERNETES */
const K8S_RES = [['Deployment', 'Deployment'], ['Service', 'Service'], ['Deployment+Service', 'Deployment + Service'], ['ConfigMap', 'ConfigMap'], ['Ingress', 'Ingress'], ['Job', 'Job'], ['CronJob', 'CronJob'], ['PersistentVolumeClaim', 'PersistentVolumeClaim']];
const has = (s, ...r) => r.includes(s.resource);
function k8sFields() {
  return [
    { id: 'resource', label: 'Resource type', type: 'select', options: K8S_RES },
    { id: 'name', label: 'Application name', type: 'text', req: true, hint: 'Lowercase letters, digits and dashes.' },
    { id: 'namespace', label: 'Namespace', type: 'text', req: true },
    { id: 'image', label: 'Container image', type: 'text', show: (s) => has(s, 'Deployment', 'Deployment+Service', 'Job', 'CronJob'), req: true, hint: 'Example: ghcr.io/acme/web' },
    { id: 'tag', label: 'Image tag', type: 'text', show: (s) => has(s, 'Deployment', 'Deployment+Service', 'Job', 'CronJob'), req: true, hint: 'Avoid "latest" in production.' },
    { id: 'pullPolicy', label: 'Image pull policy', type: 'select', show: (s) => has(s, 'Deployment', 'Deployment+Service', 'Job', 'CronJob'), options: [['IfNotPresent', 'IfNotPresent'], ['Always', 'Always'], ['Never', 'Never']] },
    { id: 'replicas', label: 'Replicas', type: 'number', show: (s) => has(s, 'Deployment', 'Deployment+Service') },
    { id: 'containerPort', label: 'Container port', type: 'number', show: (s) => has(s, 'Deployment', 'Deployment+Service', 'Service'), req: true },
    { id: 'serviceType', label: 'Service type', type: 'select', show: (s) => has(s, 'Service', 'Deployment+Service'), options: [['ClusterIP', 'ClusterIP'], ['NodePort', 'NodePort'], ['LoadBalancer', 'LoadBalancer (may create billable cloud resources)']] },
    { id: 'servicePort', label: 'Service port', type: 'number', show: (s) => has(s, 'Service', 'Deployment+Service', 'Ingress'), req: true },
    { id: 'extraLabels', label: 'Extra labels', type: 'text', hint: 'Optional, comma-separated key=value. Example: team=web,env=prod' },
    { id: 'cpuReq', label: 'CPU request', type: 'text', show: (s) => has(s, 'Deployment', 'Deployment+Service', 'Job', 'CronJob'), hint: 'Example: 100m' },
    { id: 'cpuLim', label: 'CPU limit', type: 'text', show: (s) => has(s, 'Deployment', 'Deployment+Service', 'Job', 'CronJob'), hint: 'Example: 500m' },
    { id: 'memReq', label: 'Memory request', type: 'text', show: (s) => has(s, 'Deployment', 'Deployment+Service', 'Job', 'CronJob'), hint: 'Example: 128Mi' },
    { id: 'memLim', label: 'Memory limit', type: 'text', show: (s) => has(s, 'Deployment', 'Deployment+Service', 'Job', 'CronJob'), hint: 'Example: 256Mi' },
    { id: 'probes', label: 'Add readiness and liveness probes', type: 'checkbox', show: (s) => has(s, 'Deployment', 'Deployment+Service') },
    { id: 'probePath', label: 'Probe HTTP path', type: 'text', show: (s) => s.probes && has(s, 'Deployment', 'Deployment+Service'), hint: 'Example: /health' },
    { id: 'secCtx', label: 'Apply a restricted security context', type: 'checkbox', show: (s) => has(s, 'Deployment', 'Deployment+Service', 'Job', 'CronJob'), hint: 'runAsNonRoot and no privilege escalation. Your image must support this.' },
    { id: 'envNames', label: 'Environment variable names', type: 'text', show: (s) => has(s, 'Deployment', 'Deployment+Service', 'Job', 'CronJob', 'ConfigMap'), hint: 'Names only. Never enter values or secrets.' },
    { id: 'envSource', label: 'Read those variables from', type: 'select', show: (s) => has(s, 'Deployment', 'Deployment+Service', 'Job', 'CronJob'), options: [['configmap', 'A ConfigMap (non-sensitive)'], ['secret', 'A Secret (sensitive)']] },
    { id: 'refName', label: 'ConfigMap / Secret name', type: 'text', show: (s) => has(s, 'Deployment', 'Deployment+Service', 'Job', 'CronJob') },
    { id: 'host', label: 'Ingress host', type: 'text', show: (s) => has(s, 'Ingress'), req: true, hint: 'Example: app.example.com' },
    { id: 'tlsSecret', label: 'TLS secret name (optional)', type: 'text', show: (s) => has(s, 'Ingress'), hint: 'Leave empty for no TLS.' },
    { id: 'ingressClass', label: 'Ingress class (optional)', type: 'text', show: (s) => has(s, 'Ingress'), hint: 'Example: nginx' },
    { id: 'schedule', label: 'Cron schedule', type: 'text', show: (s) => has(s, 'CronJob'), req: true, hint: 'Example: 0 2 * * *' },
    { id: 'jobCmd', label: 'Command (optional)', type: 'text', show: (s) => has(s, 'Job', 'CronJob'), hint: 'Example: node jobs/cleanup.js' },
    { id: 'storage', label: 'Storage size', type: 'text', show: (s) => has(s, 'PersistentVolumeClaim'), req: true, hint: 'Example: 5Gi' },
    { id: 'storageClass', label: 'Storage class (optional)', type: 'text', show: (s) => has(s, 'PersistentVolumeClaim') },
    { id: 'accessMode', label: 'Access mode', type: 'select', show: (s) => has(s, 'PersistentVolumeClaim'), options: [['ReadWriteOnce', 'ReadWriteOnce'], ['ReadOnlyMany', 'ReadOnlyMany'], ['ReadWriteMany', 'ReadWriteMany']] },
    { id: 'filename', label: 'Output file name', type: 'text', req: true }
  ];
}
const k8sState = () => ({ resource: 'Deployment+Service', name: 'web', namespace: 'default', image: 'ghcr.io/example/web', tag: '1.0.0', pullPolicy: 'IfNotPresent', replicas: '2', containerPort: '3000', serviceType: 'ClusterIP', servicePort: '80', extraLabels: '', cpuReq: '100m', cpuLim: '500m', memReq: '128Mi', memLim: '256Mi', probes: true, probePath: '/health', secCtx: true, envNames: '', envSource: 'configmap', refName: 'web-config', host: 'app.example.com', tlsSecret: '', ingressClass: '', schedule: '0 2 * * *', jobCmd: '', storage: '5Gi', storageClass: '', accessMode: 'ReadWriteOnce', filename: 'web.yaml' });
function k8sChange(id, s) {
  if (id === 'resource') {
    const fn = { Deployment: 'deployment.yaml', Service: 'service.yaml', 'Deployment+Service': `${s.name || 'web'}.yaml`, ConfigMap: 'configmap.yaml', Ingress: 'ingress.yaml', Job: 'job.yaml', CronJob: 'cronjob.yaml', PersistentVolumeClaim: 'pvc.yaml' }[s.resource];
    s.filename = fn;
  }
  if (id === 'envSource') s.refName = s.envSource === 'secret' ? `${s.name || 'web'}-secrets` : `${s.name || 'web'}-config`;
}
function k8sValidate(s) {
  const e = {}; commonErrors(s, e, { port: 'containerPort', portLabel: 'Container port' });
  if (!DNS_LABEL.test(s.name || '') || s.name.length > 63) e.name = 'Use lowercase letters, digits and dashes (max 63 characters).';
  if (!DNS_LABEL.test(s.namespace || '')) e.namespace = 'Use a valid namespace name (lowercase letters, digits, dashes).';
  if (has(s, 'Deployment', 'Deployment+Service', 'Job', 'CronJob')) { if (!String(s.image || '').trim()) e.image = 'Enter a container image.'; if (!String(s.tag || '').trim()) e.tag = 'Enter an image tag.'; }
  if (has(s, 'Deployment', 'Deployment+Service')) { const r = Number(s.replicas); if (!Number.isInteger(r) || r < 0 || r > 1000) e.replicas = 'Replicas must be a whole number from 0 to 1000.'; }
  if (has(s, 'Service', 'Deployment+Service', 'Ingress')) { const p = Number(s.servicePort); if (!Number.isInteger(p) || p < 1 || p > 65535) e.servicePort = 'Service port must be 1 to 65535.'; }
  if (has(s, 'Ingress') && !/^[a-z0-9.*-]+(\.[a-z0-9-]+)+$/.test(s.host || '')) e.host = 'Enter a host name such as app.example.com.';
  if (has(s, 'CronJob') && String(s.schedule || '').trim().split(/\s+/).length !== 5) e.schedule = 'A cron schedule needs 5 fields, for example 0 2 * * *.';
  if (has(s, 'PersistentVolumeClaim') && !/^\d+(\.\d+)?(Ki|Mi|Gi|Ti)$/.test(s.storage || '')) e.storage = 'Use a size like 5Gi or 500Mi.';
  checkEnvNames(s, 'envNames', e);
  (s.extraLabels ? s.extraLabels.split(',') : []).forEach((p) => { if (!/^[\w./-]+=[\w.-]*$/.test(p.trim())) e.extraLabels = 'Use key=value pairs separated by commas.'; });
  return e;
}
function k8sGenerate(s) {
  const w = []; const a = []; const docs = [];
  const ns = s.namespace; const n = s.name;
  const labels = (ind) => [`${ind}app: ${n}`, ...(s.extraLabels ? s.extraLabels.split(',').map((p) => { const [k, v] = p.trim().split('='); return `${ind}${k}: ${q(v)}`; }) : [])];
  const meta = (name, extra = []) => ['metadata:', `  name: ${name}`, `  namespace: ${ns}`, '  labels:', ...labels('    '), ...extra];
  const env = names(s.envNames);
  const container = (ind, withPorts) => {
    const c = [`- name: ${n}`, `  image: ${s.image}:${s.tag}`, `  imagePullPolicy: ${s.pullPolicy}`];
    if (withPorts) c.push('  ports:', `    - containerPort: ${s.containerPort}`);
    if (env.length) {
      c.push('  env:');
      env.forEach((v) => c.push(`    - name: ${v}`, '      valueFrom:', s.envSource === 'secret' ? '        secretKeyRef:' : '        configMapKeyRef:', `          name: ${s.refName}`, `          key: ${v}`));
    }
    const res = [];
    if (s.cpuReq || s.memReq) { res.push('    requests:'); if (s.cpuReq) res.push(`      cpu: ${q(s.cpuReq)}`); if (s.memReq) res.push(`      memory: ${q(s.memReq)}`); }
    if (s.cpuLim || s.memLim) { res.push('    limits:'); if (s.cpuLim) res.push(`      cpu: ${q(s.cpuLim)}`); if (s.memLim) res.push(`      memory: ${q(s.memLim)}`); }
    if (res.length) c.push('  resources:', ...res);
    if (withPorts && s.probes) {
      const p = (kind, extra) => [`  ${kind}:`, '    httpGet:', `      path: ${s.probePath || '/health'}`, `      port: ${s.containerPort}`, ...extra];
      c.push(...p('startupProbe', ['    failureThreshold: 30', '    periodSeconds: 5']), ...p('readinessProbe', ['    initialDelaySeconds: 5', '    periodSeconds: 10']), ...p('livenessProbe', ['    initialDelaySeconds: 15', '    periodSeconds: 20']));
    }
    if (s.secCtx) c.push('  securityContext:', '    allowPrivilegeEscalation: false', '    runAsNonRoot: true', '    capabilities:', '      drop: ["ALL"]');
    if (!withPorts && s.jobCmd) c.push(`  command: ${cmdArray(s.jobCmd)}`);
    return c.map((l) => ind + l);
  };
  const deployment = () => ['apiVersion: apps/v1', 'kind: Deployment', ...meta(n), 'spec:', `  replicas: ${s.replicas}`, '  selector:', '    matchLabels:', `      app: ${n}`, '  template:', '    metadata:', '      labels:', ...labels('        '), '    spec:', '      containers:', ...container('        ', true)].join('\n');
  const service = () => ['apiVersion: v1', 'kind: Service', ...meta(n), 'spec:', `  type: ${s.serviceType}`, '  selector:', `    app: ${n}`, '  ports:', '    - name: http', `      port: ${s.servicePort}`, `      targetPort: ${s.containerPort}`].join('\n');
  switch (s.resource) {
    case 'Deployment': docs.push(deployment()); break;
    case 'Service': docs.push(service()); break;
    case 'Deployment+Service': docs.push(deployment(), service()); break;
    case 'ConfigMap': docs.push(['apiVersion: v1', 'kind: ConfigMap', ...meta(`${n}-config`), 'data:', ...(env.length ? env.map((v) => `  ${v}: "REPLACE_ME"`) : ['  EXAMPLE_KEY: "example-value"'])].join('\n')); w.push('ConfigMaps are NOT encrypted. Never store passwords or tokens in them; use a Secret or an external secret manager.'); break;
    case 'Ingress': docs.push(['apiVersion: networking.k8s.io/v1', 'kind: Ingress', ...meta(n), 'spec:', ...(s.ingressClass ? [`  ingressClassName: ${s.ingressClass}`] : []), ...(s.tlsSecret ? ['  tls:', '    - hosts:', `        - ${s.host}`, `      secretName: ${s.tlsSecret}`] : []), '  rules:', `    - host: ${s.host}`, '      http:', '        paths:', '          - path: /', '            pathType: Prefix', '            backend:', '              service:', `                name: ${n}`, '                port:', `                  number: ${s.servicePort}`].join('\n')); a.push('An Ingress controller (for example ingress-nginx) must already be installed in the cluster.'); break;
    case 'Job': docs.push(['apiVersion: batch/v1', 'kind: Job', ...meta(n), 'spec:', '  backoffLimit: 2', '  ttlSecondsAfterFinished: 3600', '  template:', '    metadata:', '      labels:', ...labels('        '), '    spec:', '      restartPolicy: Never', '      containers:', ...container('        ', false)].join('\n')); break;
    case 'CronJob': docs.push(['apiVersion: batch/v1', 'kind: CronJob', ...meta(n), 'spec:', `  schedule: ${q(s.schedule)}`, '  concurrencyPolicy: Forbid', '  successfulJobsHistoryLimit: 3', '  failedJobsHistoryLimit: 3', '  jobTemplate:', '    spec:', '      backoffLimit: 2', '      template:', '        metadata:', '          labels:', ...labels('            '), '        spec:', '          restartPolicy: Never', '          containers:', ...container('            ', false)].join('\n')); a.push('Cron schedules run in the controller time zone (usually UTC) unless spec.timeZone is set.'); break;
    case 'PersistentVolumeClaim': docs.push(['apiVersion: v1', 'kind: PersistentVolumeClaim', ...meta(`${n}-data`), 'spec:', '  accessModes:', `    - ${s.accessMode}`, ...(s.storageClass ? [`  storageClassName: ${s.storageClass}`] : []), '  resources:', '    requests:', `      storage: ${s.storage}`].join('\n')); w.push('Check that a StorageClass exists in your cluster. Deleting a PVC may delete the underlying data depending on the reclaim policy.'); break;
  }
  if (has(s, 'Deployment', 'Deployment+Service', 'Job', 'CronJob')) {
    if (s.tag === 'latest') w.push('The "latest" tag is mutable. Pin a version or digest for repeatable deployments.');
    if (s.secCtx) w.push('Restricted security context requires an image that can run as a non-root user and writes only to writable volumes.');
    if (env.length) a.push(`The ${s.envSource === 'secret' ? 'Secret' : 'ConfigMap'} "${s.refName}" must already exist with keys: ${env.join(', ')}.`);
  }
  if (s.serviceType === 'LoadBalancer' && has(s, 'Service', 'Deployment+Service')) w.push('LoadBalancer Services usually create a billable cloud load balancer.');
  w.push('Validate against your cluster version: kubectl apply --dry-run=server -f <file>');
  return { name: s.filename, language: 'yaml', content: docs.join('\n---\n') + '\n', warnings: w, assumptions: a };
}

/* ------------------------------------------------------------------ JENKINS */
const RT_CMDS = {
  node: { install: 'npm ci', lint: 'npm run lint', test: 'npm test', build: 'npm run build', docker: 'node:20' },
  python: { install: 'python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt', lint: '. .venv/bin/activate && python -m flake8 .', test: '. .venv/bin/activate && python -m pytest', build: '. .venv/bin/activate && python -m build', docker: 'python:3.12' },
  maven: { install: 'mvn -B -q dependency:go-offline', lint: 'mvn -B -q checkstyle:check', test: 'mvn -B test', build: 'mvn -B package -DskipTests', docker: 'maven:3.9-eclipse-temurin-21' },
  go: { install: 'go mod download', lint: 'go vet ./...', test: 'go test ./...', build: 'go build ./...', docker: 'golang:1.23' },
  none: { install: '', lint: '', test: '', build: '', docker: '' }
};
const RT_OPTS = [['node', 'Node.js'], ['python', 'Python'], ['maven', 'Java (Maven)'], ['go', 'Go'], ['none', 'Other / none']];
function jenkinsFields() {
  return [
    { id: 'type', label: 'Pipeline type', type: 'select', options: [['multibranch', 'Multibranch (checkout scm)'], ['single', 'Single pipeline with Git URL']] },
    { id: 'repo', label: 'Repository URL', type: 'text', show: (s) => s.type === 'single', req: true, hint: 'https or ssh URL, no passwords in it.' },
    { id: 'branch', label: 'Branch', type: 'text', show: (s) => s.type === 'single', req: true },
    { id: 'runtime', label: 'Language / runtime', type: 'select', options: RT_OPTS },
    { id: 'agent', label: 'Agent', type: 'select', options: [['any', 'Any available agent'], ['label', 'Agent with a label'], ['docker', 'Docker container']] },
    { id: 'agentLabel', label: 'Agent label', type: 'text', show: (s) => s.agent === 'label' },
    { id: 'dockerImage', label: 'Docker image for the build', type: 'text', show: (s) => s.agent === 'docker', hint: 'Needs the Docker Pipeline plugin and Docker on the agent.' },
    { id: 'install', label: 'Install dependencies stage', type: 'checkbox' },
    { id: 'lint', label: 'Lint stage', type: 'checkbox' },
    { id: 'test', label: 'Test stage', type: 'checkbox' },
    { id: 'build', label: 'Build stage', type: 'checkbox' },
    { id: 'artifacts', label: 'Archive artifacts (glob, optional)', type: 'text', hint: 'Example: dist/**/* or target/*.jar' },
    { id: 'deploy', label: 'Add a deploy stage', type: 'checkbox' },
    { id: 'deployBranch', label: 'Deploy only on branch', type: 'text', show: (s) => s.deploy && s.type === 'multibranch' },
    { id: 'credId', label: 'Credential ID (the ID only)', type: 'text', show: (s) => s.deploy, hint: 'The name of a credential stored in Jenkins. Never type the secret value.' },
    { id: 'deployCmd', label: 'Deploy command', type: 'text', show: (s) => s.deploy, hint: 'Example: ./scripts/deploy.sh' },
    { id: 'filename', label: 'Output file name', type: 'text', req: true }
  ];
}
const jenkinsState = () => ({ type: 'multibranch', repo: '', branch: 'main', runtime: 'node', agent: 'any', agentLabel: 'linux', dockerImage: 'node:20', install: true, lint: false, test: true, build: true, artifacts: 'dist/**/*', deploy: false, deployBranch: 'main', credId: 'deploy-token', deployCmd: './scripts/deploy.sh', filename: 'Jenkinsfile' });
function jenkinsChange(id, s) { if (id === 'runtime') s.dockerImage = RT_CMDS[s.runtime].docker; }
function jenkinsValidate(s) {
  const e = {}; commonErrors(s, e);
  if (s.type === 'single') { if (!/^(https?:\/\/|git@|ssh:\/\/)/.test(s.repo || '')) e.repo = 'Enter an https:// or ssh URL.'; if (/\/\/[^/@]+:[^/@]+@/.test(s.repo || '')) e.repo = 'Remove credentials from the URL. Use a Jenkins credential ID instead.'; if (!String(s.branch || '').trim()) e.branch = 'Enter a branch.'; }
  if (s.agent === 'label' && !String(s.agentLabel || '').trim()) e.agentLabel = 'Enter an agent label.';
  if (s.agent === 'docker' && !String(s.dockerImage || '').trim()) e.dockerImage = 'Enter a Docker image.';
  if (s.deploy && !/^[\w.-]+$/.test(s.credId || '')) e.credId = 'Credential IDs use letters, digits, dots, dashes and underscores.';
  if (s.deploy && !String(s.deployCmd || '').trim()) e.deployCmd = 'Enter a deploy command.';
  if (!String(s.filename || '').trim()) e.filename = 'Enter a file name.';
  return e;
}
function jenkinsGenerate(s) {
  const c = RT_CMDS[s.runtime]; const w = []; const a = []; const L = [];
  const esc = (x) => String(x).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  L.push('// Jenkinsfile — generated by DevOps Master', 'pipeline {');
  L.push(s.agent === 'any' ? '  agent any' : s.agent === 'label' ? `  agent { label '${esc(s.agentLabel)}' }` : `  agent { docker { image '${esc(s.dockerImage)}' } }`);
  L.push('  options {', '    timestamps()', "    timeout(time: 30, unit: 'MINUTES')", '    disableConcurrentBuilds()', "    buildDiscarder(logRotator(numToKeepStr: '20'))", '  }', '  stages {');
  L.push("    stage('Checkout') {", '      steps {', s.type === 'multibranch' ? '        checkout scm' : `        git branch: '${esc(s.branch)}', url: '${esc(s.repo)}'`, '      }', '    }');
  [['install', 'Install'], ['lint', 'Lint'], ['test', 'Test'], ['build', 'Build']].forEach(([k, label]) => {
    if (s[k]) {
      if (!c[k]) { L.push(`    stage('${label}') {`, '      steps {', `        echo 'Add your ${label.toLowerCase()} command here'`, '      }', '    }'); w.push(`No default ${label.toLowerCase()} command for this runtime; a placeholder echo was added.`); }
      else L.push(`    stage('${label}') {`, '      steps {', `        sh '${esc(c[k])}'`, '      }', ...(k === 'test' ? ['      post {', "        always { junit allowEmptyResults: true, testResults: '**/test-results/*.xml' }", '      }'] : []), '    }');
    }
  });
  if (s.deploy) {
    L.push("    stage('Deploy') {");
    if (s.type === 'multibranch' && s.deployBranch) L.push('      when {', `        branch '${esc(s.deployBranch)}'`, '      }');
    L.push('      steps {', `        withCredentials([string(credentialsId: '${esc(s.credId)}', variable: 'DEPLOY_TOKEN')]) {`, `          sh '${esc(s.deployCmd)}'`, '        }', '      }', '    }');
    w.push(`Credential "${s.credId}" must exist in Jenkins as a Secret text credential. The token is exposed to your command as $DEPLOY_TOKEN; do not echo it.`);
    w.push('Deploy runs real changes. Test the command in a non-production environment first.');
  }
  L.push('  }', '  post {', '    always {');
  if (s.artifacts) L.push(`      archiveArtifacts artifacts: '${esc(s.artifacts)}', allowEmptyArchive: true`);
  L.push('      cleanWs()', '    }', '    failure {', "      echo 'Build failed. Check the Console Output.'", '    }', '  }', '}');
  if (s.agent === 'docker') a.push('Docker agent mode requires the Docker Pipeline plugin and a Docker daemon on the agent.');
  a.push('The junit step is harmless when no XML exists; adjust the path to your test reporter.');
  if (s.runtime === 'python') a.push('Python commands create a .venv in the workspace. Use a Python-capable agent or Docker image.');
  return { name: s.filename, language: 'groovy', content: L.join('\n') + '\n', warnings: w, assumptions: a };
}

/* ------------------------------------------------------------------ GITHUB ACTIONS */
const GHA_VERS = { node: ['22', '20', '18'], python: ['3.13', '3.12', '3.11'], java: ['21', '17'], go: ['1.23', '1.22'] };
function ghaFields() {
  return [
    { id: 'name', label: 'Workflow name', type: 'text', req: true },
    { id: 'onPush', label: 'Run on push', type: 'checkbox' },
    { id: 'onPr', label: 'Run on pull requests', type: 'checkbox' },
    { id: 'onManual', label: 'Allow manual runs (workflow_dispatch)', type: 'checkbox' },
    { id: 'onSchedule', label: 'Run on a schedule', type: 'checkbox' },
    { id: 'cron', label: 'Cron schedule (UTC)', type: 'text', show: (s) => s.onSchedule, hint: 'Example: 0 3 * * 1 (Mondays 03:00 UTC)' },
    { id: 'branches', label: 'Branches', type: 'text', hint: 'Comma-separated. Example: main, release/*' },
    { id: 'runtime', label: 'Runtime', type: 'select', options: [['node', 'Node.js'], ['python', 'Python'], ['java', 'Java (Maven)'], ['go', 'Go']] },
    { id: 'version', label: 'Version', type: 'select', options: (s) => GHA_VERS[s.runtime].map((v) => [v, v]) },
    { id: 'install', label: 'Install dependencies', type: 'checkbox' },
    { id: 'lint', label: 'Lint', type: 'checkbox' },
    { id: 'test', label: 'Test', type: 'checkbox' },
    { id: 'build', label: 'Build', type: 'checkbox' },
    { id: 'artifact', label: 'Upload build artifact path (optional)', type: 'text', hint: 'Example: dist' },
    { id: 'deploy', label: 'Add a deploy job', type: 'checkbox' },
    { id: 'environment', label: 'Deployment environment name', type: 'text', show: (s) => s.deploy, hint: 'Create it in repo Settings > Environments to add approvals and secrets.' },
    { id: 'filename', label: 'Output file name', type: 'text', req: true }
  ];
}
const ghaState = () => ({ name: 'CI', onPush: true, onPr: true, onManual: true, onSchedule: false, cron: '0 3 * * 1', branches: 'main', runtime: 'node', version: '20', install: true, lint: false, test: true, build: true, artifact: '', deploy: false, environment: 'production', filename: 'ci.yml' });
function ghaChange(id, s) { if (id === 'runtime') s.version = GHA_VERS[s.runtime][1] || GHA_VERS[s.runtime][0]; }
function ghaValidate(s) {
  const e = {}; commonErrors(s, e);
  if (!String(s.name || '').trim()) e.name = 'Enter a workflow name.';
  if (!(s.onPush || s.onPr || s.onManual || s.onSchedule)) e.onPush = 'Choose at least one trigger.';
  if (s.onSchedule && String(s.cron || '').trim().split(/\s+/).length !== 5) e.cron = 'A cron schedule needs 5 fields.';
  if ((s.onPush || s.onPr) && !names(s.branches.replace(/,/g, ' ')).length) e.branches = 'Enter at least one branch.';
  if (s.deploy && !/^[\w. -]+$/.test(s.environment || '')) e.environment = 'Enter an environment name.';
  if (!/\.ya?ml$/.test(s.filename || '')) e.filename = 'Workflow files must end in .yml or .yaml.';
  return e;
}
function ghaGenerate(s) {
  const w = []; const a = []; const L = [];
  const br = JSON.stringify(s.branches.split(',').map((x) => x.trim()).filter(Boolean));
  L.push(`# .github/workflows/${s.filename} — generated by DevOps Master`, `name: ${q(s.name)}`, 'on:');
  if (s.onPush) L.push('  push:', `    branches: ${br}`);
  if (s.onPr) L.push('  pull_request:', `    branches: ${br}`);
  if (s.onManual) L.push('  workflow_dispatch:');
  if (s.onSchedule) L.push('  schedule:', `    - cron: ${q(s.cron)}`);
  L.push('', 'permissions:', '  contents: read', '', 'concurrency:', '  group: ${{ github.workflow }}-${{ github.ref }}', '  cancel-in-progress: true', '', 'jobs:', '  build:', '    runs-on: ubuntu-latest', '    timeout-minutes: 15', '    steps:', '      - uses: actions/checkout@v4');
  const rt = s.runtime;
  if (rt === 'node') L.push('      - uses: actions/setup-node@v4', '        with:', `          node-version: ${q(s.version)}`, '          cache: npm');
  if (rt === 'python') L.push('      - uses: actions/setup-python@v5', '        with:', `          python-version: ${q(s.version)}`, '          cache: pip');
  if (rt === 'java') L.push('      - uses: actions/setup-java@v4', '        with:', '          distribution: temurin', `          java-version: ${q(s.version)}`, '          cache: maven');
  if (rt === 'go') L.push('      - uses: actions/setup-go@v5', '        with:', `          go-version: ${q(s.version)}`);
  const steps = { node: { install: 'npm ci', lint: 'npm run lint --if-present', test: 'npm test --if-present', build: 'npm run build --if-present' }, python: { install: 'python -m pip install --upgrade pip\npip install -r requirements.txt', lint: 'python -m pip install flake8\nflake8 .', test: 'python -m pip install pytest\npytest', build: 'python -m pip install build\npython -m build' }, java: { install: 'mvn -B -q dependency:go-offline', lint: 'mvn -B -q checkstyle:check', test: 'mvn -B test', build: 'mvn -B package -DskipTests' }, go: { install: 'go mod download', lint: 'go vet ./...', test: 'go test ./...', build: 'go build ./...' } }[rt];
  [['install', 'Install dependencies'], ['lint', 'Lint'], ['test', 'Test'], ['build', 'Build']].forEach(([k, label]) => {
    if (!s[k]) return;
    const cmd = steps[k];
    if (cmd.includes('\n')) L.push(`      - name: ${label}`, '        run: |', ...cmd.split('\n').map((l) => '          ' + l));
    else L.push(`      - name: ${label}`, `        run: ${cmd}`);
  });
  if (s.artifact) L.push('      - uses: actions/upload-artifact@v4', '        with:', '          name: build-output', `          path: ${s.artifact}`, '          if-no-files-found: warn');
  if (s.deploy) {
    L.push('', '  deploy:', '    needs: build', "    if: github.ref == 'refs/heads/" + (s.branches.split(',')[0] || 'main').trim() + "' && github.event_name == 'push'", `    environment: ${s.environment}`, '    runs-on: ubuntu-latest', '    permissions:', '      contents: read', '    steps:', '      - name: Deploy', '        env:', '          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}', '        run: echo "Replace this step with your real deployment command"');
    w.push('The deploy job is a placeholder. Add real deployment steps, and store credentials as repository or environment secrets (DEPLOY_TOKEN here). Prefer short-lived OIDC credentials for cloud deploys.');
  }
  a.push('Save this file as .github/workflows/' + s.filename + ' in your repository.');
  a.push('Permissions default to contents: read. Add more per job only when a step needs it.');
  a.push('For stronger supply-chain safety, pin third-party actions to a full commit SHA and check for newer major versions.');
  return { name: s.filename, language: 'yaml', content: L.join('\n') + '\n', warnings: w, assumptions: a, path: `.github/workflows/${s.filename}` };
}

/* ------------------------------------------------------------------ TERRAFORM */
const TF_RES = {
  aws: [['s3', 'S3 bucket (private, encrypted, versioned)'], ['ec2', 'EC2 instance'], ['vpc', 'VPC with one public subnet']],
  azurerm: [['rg-storage', 'Resource group + storage account']],
  google: [['gcs', 'Cloud Storage bucket']]
};
function tfFields() {
  return [
    { id: 'provider', label: 'Provider', type: 'select', options: [['aws', 'AWS'], ['azurerm', 'Azure'], ['google', 'Google Cloud']] },
    { id: 'resource', label: 'Resource', type: 'select', options: (s) => TF_RES[s.provider] },
    { id: 'region', label: 'Region / location', type: 'text', req: true, hint: 'Example: ap-south-1, centralindia, asia-south1' },
    { id: 'projectId', label: 'Google project ID', type: 'text', show: (s) => s.provider === 'google', req: true, hint: 'ID only, not a key file.' },
    { id: 'name', label: 'Resource name prefix', type: 'text', req: true, hint: 'Lowercase letters, digits and dashes. Bucket and storage names must be globally unique.' },
    { id: 'instanceType', label: 'Instance type', type: 'text', show: (s) => s.resource === 'ec2', hint: 'Example: t3.micro' },
    { id: 'cidr', label: 'VPC CIDR block', type: 'text', show: (s) => s.resource === 'vpc', hint: 'Example: 10.0.0.0/16' },
    { id: 'env', label: 'Tag: environment', type: 'text', hint: 'Example: dev' },
    { id: 'owner', label: 'Tag: owner', type: 'text', hint: 'Team or person responsible.' },
    { id: 'outputs', label: 'Include outputs', type: 'checkbox' },
    { id: 'filename', label: 'Output file name', type: 'text', req: true }
  ];
}
const tfState = () => ({ provider: 'aws', resource: 's3', region: 'ap-south-1', projectId: '', name: 'my-app-dev', instanceType: 't3.micro', cidr: '10.0.0.0/16', env: 'dev', owner: 'platform-team', outputs: true, filename: 'main.tf' });
function tfChange(id, s) {
  if (id === 'provider') { s.resource = TF_RES[s.provider][0][0]; s.region = { aws: 'ap-south-1', azurerm: 'centralindia', google: 'asia-south1' }[s.provider]; }
}
function tfValidate(s) {
  const e = {}; commonErrors(s, e);
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(s.name || '')) e.name = 'Use 2 to 41 lowercase letters, digits or dashes; start with a letter or digit.';
  if (!/^[a-z0-9-]+$/.test(s.region || '')) e.region = 'Enter a region such as ap-south-1.';
  if (s.provider === 'google' && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(s.projectId || '')) e.projectId = 'Enter a valid project ID.';
  if (s.resource === 'vpc' && !/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(s.cidr || '')) e.cidr = 'Enter a CIDR such as 10.0.0.0/16.';
  if (!/\.tf$/.test(s.filename || '')) e.filename = 'Terraform files end in .tf.';
  return e;
}
function tfGenerate(s) {
  const w = []; const a = []; const L = [];
  L.push('# main.tf — generated by DevOps Master', '# Review "terraform plan" output before every apply.', '', 'terraform {', '  required_version = ">= 1.6.0"', '  required_providers {');
  const P = { aws: ['aws', 'hashicorp/aws', '~> 5.0'], azurerm: ['azurerm', 'hashicorp/azurerm', '~> 3.100'], google: ['google', 'hashicorp/google', '~> 5.0'] }[s.provider];
  L.push(`    ${P[0]} = {`, `      source  = "${P[1]}"`, `      version = "${P[2]}"`, '    }', '  }', '}', '');
  L.push('variable "region" {', '  type    = string', `  default = ${q(s.region)}`, '}', '', 'variable "name" {', '  type    = string', `  default = ${q(s.name)}`, '}', '', 'locals {', '  tags = {', `    Environment = ${q(s.env || 'dev')}`, `    Owner       = ${q(s.owner || 'unknown')}`, '    ManagedBy   = "terraform"', '  }', '}', '');
  if (s.provider === 'aws') L.push('provider "aws" {', '  region = var.region', '}', '');
  if (s.provider === 'azurerm') L.push('provider "azurerm" {', '  features {}', '}', '');
  if (s.provider === 'google') L.push('provider "google" {', `  project = ${q(s.projectId)}`, '  region  = var.region', '}', '');
  const out = [];
  if (s.resource === 's3') {
    L.push('resource "aws_s3_bucket" "this" {', '  bucket = var.name', '  tags   = local.tags', '}', '', 'resource "aws_s3_bucket_public_access_block" "this" {', '  bucket                  = aws_s3_bucket.this.id', '  block_public_acls       = true', '  block_public_policy     = true', '  ignore_public_acls      = true', '  restrict_public_buckets = true', '}', '', 'resource "aws_s3_bucket_versioning" "this" {', '  bucket = aws_s3_bucket.this.id', '  versioning_configuration {', '    status = "Enabled"', '  }', '}', '', 'resource "aws_s3_bucket_server_side_encryption_configuration" "this" {', '  bucket = aws_s3_bucket.this.id', '  rule {', '    apply_server_side_encryption_by_default {', '      sse_algorithm = "AES256"', '    }', '  }', '}', '');
    out.push(['bucket_name', 'aws_s3_bucket.this.bucket'], ['bucket_arn', 'aws_s3_bucket.this.arn']);
    w.push('S3 bucket names are global. If the name is taken, apply will fail; choose another prefix. Storage and requests are billed by usage.');
  }
  if (s.resource === 'ec2') {
    L.push('variable "instance_type" {', '  type    = string', `  default = ${q(s.instanceType || 't3.micro')}`, '}', '', 'data "aws_ssm_parameter" "al2023" {', '  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"', '}', '', 'resource "aws_instance" "this" {', '  ami           = data.aws_ssm_parameter.al2023.value', '  instance_type = var.instance_type', '  metadata_options {', '    http_tokens = "required"', '  }', '  root_block_device {', '    encrypted = true', '  }', '  tags = merge(local.tags, { Name = var.name })', '}', '');
    out.push(['instance_id', 'aws_instance.this.id']);
    w.push('COST: a running EC2 instance (plus its EBS volume) bills continuously. Destroy it when you finish practising.');
    a.push('Uses the default VPC and no key pair or security group changes. Add SSM or a key pair if you need to log in.');
  }
  if (s.resource === 'vpc') {
    L.push('variable "cidr" {', '  type    = string', `  default = ${q(s.cidr)}`, '}', '', 'resource "aws_vpc" "this" {', '  cidr_block           = var.cidr', '  enable_dns_hostnames = true', '  tags                 = merge(local.tags, { Name = var.name })', '}', '', 'resource "aws_internet_gateway" "this" {', '  vpc_id = aws_vpc.this.id', '  tags   = local.tags', '}', '', 'resource "aws_subnet" "public" {', '  vpc_id                  = aws_vpc.this.id', '  cidr_block              = cidrsubnet(var.cidr, 8, 0)', '  map_public_ip_on_launch = true', '  tags                    = merge(local.tags, { Name = "${var.name}-public" })', '}', '', 'resource "aws_route_table" "public" {', '  vpc_id = aws_vpc.this.id', '  route {', '    cidr_block = "0.0.0.0/0"', '    gateway_id = aws_internet_gateway.this.id', '  }', '  tags = local.tags', '}', '', 'resource "aws_route_table_association" "public" {', '  subnet_id      = aws_subnet.public.id', '  route_table_id = aws_route_table.public.id', '}', '');
    out.push(['vpc_id', 'aws_vpc.this.id'], ['public_subnet_id', 'aws_subnet.public.id']);
    w.push('The VPC itself is free, but resources you add later (NAT gateways, load balancers, instances) are billed. No NAT gateway is included.');
  }
  if (s.resource === 'rg-storage') {
    L.push('resource "azurerm_resource_group" "this" {', '  name     = "${var.name}-rg"', '  location = var.region', '  tags     = local.tags', '}', '', 'resource "azurerm_storage_account" "this" {', '  name                            = replace("${var.name}sa", "-", "")', '  resource_group_name             = azurerm_resource_group.this.name', '  location                        = azurerm_resource_group.this.location', '  account_tier                    = "Standard"', '  account_replication_type        = "LRS"', '  min_tls_version                 = "TLS1_2"', '  allow_nested_items_to_be_public = false', '  tags                            = local.tags', '}', '');
    out.push(['resource_group', 'azurerm_resource_group.this.name'], ['storage_account', 'azurerm_storage_account.this.name']);
    w.push('Azure storage account names must be 3-24 lowercase letters and digits and globally unique. Storage is billed by usage.');
  }
  if (s.resource === 'gcs') {
    L.push('resource "google_storage_bucket" "this" {', '  name                        = var.name', '  location                    = var.region', '  uniform_bucket_level_access = true', '  public_access_prevention    = "enforced"', '  labels                      = { environment = lower(local.tags.Environment), owner = lower(local.tags.Owner) }', '}', '');
    out.push(['bucket_name', 'google_storage_bucket.this.name']);
    w.push('GCS bucket names are global. Storage and operations are billed by usage.');
  }
  if (s.outputs) out.forEach(([n, v]) => L.push(`output "${n}" {`, `  value = ${v}`, '}', ''));
  w.push('This file contains no credentials. Authenticate with your provider CLI, SSO or environment, never with keys written in .tf files.');
  w.push('Always run: terraform init, terraform fmt, terraform validate, terraform plan, then read the plan before terraform apply.');
  a.push('Provider and version constraints reflect recent releases; check the provider registry for the version you want.');
  a.push('Use a remote backend with state locking for team work, and keep state files out of Git.');
  return { name: s.filename, language: 'hcl', content: L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', warnings: w, assumptions: a };
}

/* ------------------------------------------------------------------ REGISTRY + EXAMPLES */
const withState = (stateFn, over) => ({ ...stateFn(), ...over });
const ex = (id, label, desc, make) => ({ id, label, desc, make });

const dfEx = (over) => () => dockerfileGenerate(withState(dockerfileState, over));
const K8S_SECRET = `# Secret template — placeholders only. Do NOT commit real values.
# Prefer creating secrets with: kubectl create secret generic web-secrets --from-literal=API_TOKEN=... (from a secure shell)
# or use an external secret manager (External Secrets Operator, Sealed Secrets, cloud secret stores).
apiVersion: v1
kind: Secret
metadata:
  name: web-secrets
  namespace: default
type: Opaque
stringData:
  API_TOKEN: "<replace-me>"
  DB_PASSWORD: "<replace-me>"
`;

export const GENERATORS = {
  dockerfile: { id: 'dockerfile', title: 'Dockerfile generator', tool: 'Docker', folder: 'Docker', intro: 'I will ask about your runtime, port and start command, then write a Dockerfile you can edit. Remember: EXPOSE documents a port, it does not publish it.',
    fields: dockerfileFields, state: dockerfileState, onChange: dockerfileChange, validate: dockerfileValidate, generate: dockerfileGenerate,
    examples: [ex('df-node', 'Dockerfile — Node.js', 'Production Node.js app with a non-root user', dfEx({ healthcheck: true })), ex('df-py', 'Dockerfile — Python', 'Python web app using requirements.txt', dfEx({ ...dockerfileDefaults('python'), project: 'py-app', env: 'DATABASE_URL', healthcheck: false })), ex('df-nginx', 'Dockerfile — Nginx', 'Serve a static site from the dist folder', dfEx({ ...dockerfileDefaults('nginx'), project: 'static-site', env: '', nonroot: true, port: '8080' })), ex('df-go', 'Dockerfile — Go (multi-stage)', 'Small distroless image for a Go binary', dfEx({ ...dockerfileDefaults('go'), project: 'go-api', env: '' }))] },
  'docker-compose': { id: 'docker-compose', title: 'Docker Compose generator', tool: 'Docker', folder: 'Docker', intro: 'Tell me which services you need. I will connect them on one network, add health checks and keep passwords out of the file.',
    fields: composeFields, state: composeState, onChange: composeChange, validate: composeValidate, generate: composeGenerate,
    examples: [ex('dc-web-db', 'compose.yaml — Web app + database', 'App with PostgreSQL and a named volume', () => composeGenerate(composeState())), ex('dc-redis', 'compose.yaml — Web app + MySQL + Redis', 'Adds a cache service', () => composeGenerate({ ...composeState(), db: 'mysql', dbVersion: '8.4', cache: true }))] },
  kubernetes: { id: 'kubernetes', title: 'Kubernetes manifest generator', tool: 'Kubernetes', folder: 'Kubernetes', intro: 'Pick a resource type and I will draft the YAML with resource limits, probes and secret references. Validate it against your cluster before applying.',
    fields: k8sFields, state: k8sState, onChange: k8sChange, validate: k8sValidate, generate: k8sGenerate,
    examples: [ex('k-dep', 'deployment.yaml', 'Deployment with probes and limits', () => k8sGenerate({ ...k8sState(), resource: 'Deployment', filename: 'deployment.yaml' })), ex('k-svc', 'service.yaml', 'ClusterIP Service for the Deployment', () => k8sGenerate({ ...k8sState(), resource: 'Service', filename: 'service.yaml' })), ex('k-cm', 'configmap.yaml', 'Non-sensitive configuration', () => k8sGenerate({ ...k8sState(), resource: 'ConfigMap', envNames: 'LOG_LEVEL, FEATURE_FLAG', filename: 'configmap.yaml' })), ex('k-secret', 'secret template (placeholders)', 'Placeholders only, never real values', () => ({ name: 'secret-template.yaml', language: 'yaml', content: K8S_SECRET, warnings: ['Secrets are only base64-encoded, not encrypted, unless you enable encryption at rest. Limit RBAC access.'], assumptions: [] }))] },
  jenkins: { id: 'jenkins', title: 'Jenkins pipeline generator', tool: 'Jenkins', folder: 'Jenkins', intro: 'I will write a declarative Jenkinsfile. For credentials, I only need the credential ID, never the secret itself.',
    fields: jenkinsFields, state: jenkinsState, onChange: jenkinsChange, validate: jenkinsValidate, generate: jenkinsGenerate,
    examples: [ex('j-basic', 'Jenkinsfile — basic pipeline', 'Checkout, install, test, build, archive', () => jenkinsGenerate(jenkinsState()))] },
  'github-actions': { id: 'github-actions', title: 'GitHub Actions workflow generator', tool: 'GitHub Actions', folder: 'GitHub Actions', intro: 'I will draft a workflow with least-privilege permissions. Save it to .github/workflows/ in your repository.',
    fields: ghaFields, state: ghaState, onChange: ghaChange, validate: ghaValidate, generate: ghaGenerate,
    examples: [ex('g-node', 'ci.yml — Node.js CI', 'Install, test and build on every push and PR', () => ghaGenerate(ghaState())), ex('g-py', 'ci.yml — Python CI', 'pip install, lint and pytest', () => ghaGenerate({ ...ghaState(), runtime: 'python', version: '3.12', lint: true, build: false }))] },
  terraform: { id: 'terraform', title: 'Terraform configuration generator', tool: 'Terraform', folder: 'Terraform', intro: 'Choose a provider and a starter resource. Cloud resources can cost money, so I will flag them. Always read the plan before applying.',
    fields: tfFields, state: tfState, onChange: tfChange, validate: tfValidate, generate: tfGenerate,
    examples: [ex('t-s3', 'main.tf — private S3 bucket', 'Encrypted, versioned, non-public bucket', () => tfGenerate(tfState())), ex('t-vpc', 'main.tf — VPC with public subnet', 'Basic network, no NAT gateway', () => tfGenerate({ ...tfState(), resource: 'vpc', name: 'my-vpc' }))] }
};

export const GENERATOR_LIST = [
  ['dockerfile', 'Dockerfile Generator'], ['docker-compose', 'Docker Compose Generator'], ['kubernetes', 'Kubernetes Manifest Generator'],
  ['jenkins', 'Jenkins Pipeline Generator'], ['github-actions', 'GitHub Actions Workflow Generator'], ['terraform', 'Terraform Configuration Generator']
];

/** Simple secret detector used before export/save. Returns list of human-readable findings. */
export function looksLikeSecrets(text) {
  const t = String(text || ''); const hits = [];
  const rules = [[/AKIA[0-9A-Z]{16}/, 'an AWS access key ID'], [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'], [/gh[pousr]_[A-Za-z0-9]{30,}/, 'a GitHub token'], [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'], [/(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["']?(?!<|\$\{|\$\(|REPLACE|replace|change-me|example|your|xxx)[^\s"'<>$]{8,}/i, 'a value assigned to a password, token or key field']];
  rules.forEach(([re, label]) => { if (re.test(t)) hits.push(label); });
  return hits;
}
