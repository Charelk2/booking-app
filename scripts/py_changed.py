import subprocess
import os


def main():
    try:
        base = (
            subprocess.check_output(['git', 'merge-base', 'origin/main', 'HEAD'])
            .decode()
            .strip()
        )
    except subprocess.CalledProcessError:
        base = subprocess.check_output(['git', 'rev-parse', 'HEAD^']).decode().strip()

    diff = subprocess.check_output(['git', 'diff', '--name-only', f'{base}...HEAD'])
    files = [f for f in diff.decode().splitlines() if f.endswith('.py')]
    names = [os.path.splitext(os.path.basename(f))[0] for f in files]
    expr = ' or '.join(sorted(set(names)))
    if expr:
        print(expr)


if __name__ == '__main__':
    main()
