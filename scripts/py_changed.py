import subprocess


def main():
    try:
        base = subprocess.check_output(['git', 'merge-base', 'origin/main', 'HEAD']).decode().strip()
    except subprocess.CalledProcessError:
        base = subprocess.check_output(['git', 'rev-parse', 'HEAD^']).decode().strip()
    diff = subprocess.check_output(['git', 'diff', '--name-only', f'{base}...HEAD'])
    files = [f for f in diff.decode().splitlines() if f.endswith('.py')]
    if files:
        print(' '.join(files))


if __name__ == '__main__':
    main()
