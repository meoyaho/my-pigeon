# Desktop Pigeon Pet

Electron으로 만든 데스크톱 비둘기 펫 앱입니다. 실행하면 투명 오버레이 위에 비둘기가 뜨고, 메뉴바/tray 메뉴에서 먹이 주기, 퇴근을 할 수 있습니다.

## 처음 실행하기

현재 이 repo는 아직 배포용 앱이 아니라 개발용 소스코드입니다. 그래서 처음 실행하는 사람도 Node.js와 npm을 설치한 뒤 Terminal에서 실행해야 합니다.

1. Node.js 20 LTS 이상을 설치합니다: <https://nodejs.org/>
2. Terminal을 엽니다.
3. 프로젝트 폴더로 이동합니다.

```bash
cd /Users/jisuryou/my-pigeon
```

4. 의존성을 한 번 설치합니다.

```bash
npm install
```

5. 앱을 실행합니다.

```bash
npm start
```

앱이 실행되면 데스크톱 위에 비둘기가 뜹니다. 메뉴바/tray의 `비둘기 펫` 메뉴에서 다음 기능을 사용할 수 있습니다.

- `먹이 주기`: 비둘기 먹이 놓기
- `퇴근`: 퇴근 애니메이션 후 앱 종료

## nvm을 쓰는 경우

`nvm`을 쓰고 있다면 이 repo의 `.nvmrc`를 사용해서 Node 버전을 맞출 수 있습니다.

```bash
nvm install
nvm use
npm install
npm start
```

## 실행 전 점검

앱이 실행되지 않으면 먼저 이 명령을 실행합니다.

```bash
npm run doctor
```

`doctor`는 Node.js 버전, 의존성 설치 여부, 필요한 앱 파일이 있는지 확인합니다. `FAIL`이 나오면 그 아래에 적힌 안내를 따르면 됩니다.

## 자주 막히는 부분

`Node.js >= 20`에서 실패하면 Node.js 버전이 낮은 상태입니다. Node.js 20 LTS 이상으로 바꾼 뒤 다시 실행합니다.

`electron: command not found`가 나오면 의존성이 아직 설치되지 않은 상태입니다.

```bash
npm install
```

macOS에서 앱은 켜졌는데 활성 창 반응 같은 일부 기능이 동작하지 않으면, 시스템 설정의 개인정보 보호 권한에서 Terminal 또는 앱 권한을 허용해야 할 수 있습니다. 이 권한이 없어도 기본 비둘기 오버레이는 동작합니다.

실행했는데 앱을 찾기 어렵다면 macOS 메뉴바 또는 Windows/Linux tray 영역에서 `비둘기 펫` 항목을 찾습니다.

## 개발자가 아닌 테스터에게 공유하려면

Terminal을 쓰지 않는 사람에게 가장 쉬운 방식은 macOS `.app` 또는 `.dmg` 같은 패키징된 앱을 전달하는 것입니다. 이 repo에는 아직 패키징 단계가 없어서, 지금은 위의 Terminal 실행 방식이 필요합니다.

여러 사람에게 공유하기 전에는 `electron-builder` 같은 도구로 배포용 앱을 만드는 단계를 추가하는 것이 좋습니다.

```bash
npm install --save-dev electron-builder
```

그 다음 다운로드 가능한 앱 번들을 만드는 build script를 추가합니다.

## GitHub Pages 다운로드 페이지

이 repo의 공개 다운로드 페이지는 `docs/` 루트에 들어 있습니다. GitHub Pages는 `docs/index.html`을 `https://meoyaho.github.io/my-pigeon/`로 배포하고, 실제 앱 설치 파일은 GitHub Releases에서 내려받게 연결합니다.

사용자 흐름:

1. 사용자가 `https://meoyaho.github.io/my-pigeon/`에 접속합니다.
2. 화면 중앙의 비둘기에 마우스를 올리면 문구와 이미지가 바뀝니다.
3. 비둘기를 클릭하면 최신 GitHub Release의 설치 파일 다운로드로 이동합니다.

배포 설정:

1. `.dmg`, `.zip`, `.exe`, `.AppImage` 같은 설치 파일을 GitHub Releases에 업로드합니다.
2. GitHub 저장소의 `Settings` → `Pages`로 이동합니다.
3. `Source`를 `Deploy from a branch`로 설정합니다.
4. `Branch`는 `main`, 폴더는 `/docs`로 선택하고 저장합니다.
5. `main` 브랜치에 push하면 GitHub Pages가 `docs/index.html`을 배포합니다.

배포 후 페이지 주소는 보통 다음과 같습니다.

```text
https://meoyaho.github.io/my-pigeon/
```

`docs/index.html`의 다운로드 버튼은 최신 GitHub Release의 설치 파일을 찾아 연결합니다. 설치 파일이 아직 없으면 최신 Releases 페이지로 이동합니다.

## 개발 명령어

앱 실행:

```bash
npm start
```

개발용 alias:

```bash
npm run dev
```

테스트:

```bash
npm test
```

배포용 macOS 앱 빌드:

```bash
npm run build
```

빌드가 끝나면 `dist/`에 `.dmg`와 `.zip` 파일이 생성됩니다. GitHub Release에는 이 설치 파일을 업로드하면 됩니다. 앱 이름은 `My Pigeon`이고, 앱 아이콘은 `assets/icon.png`에서 생성됩니다.

현재 빌드는 Apple Developer ID로 코드서명/노터라이즈되지 않은 빌드입니다. macOS에서 다운로드한 `.dmg`를 열 때 `손상되었기 때문에 열 수 없습니다` 같은 Gatekeeper 경고가 뜰 수 있습니다.

내 Mac에서만 테스트할 때는 앱을 Applications로 옮긴 뒤 다음 명령으로 quarantine 속성을 제거할 수 있습니다.

```bash
xattr -dr com.apple.quarantine "/Applications/My Pigeon.app"
```

다른 사람에게 자연스럽게 배포하려면 Apple Developer Program 인증서로 Developer ID 코드서명을 하고 Apple notarization까지 해야 합니다. 이 과정을 거친 `.dmg`를 GitHub Release에 올려야 macOS 사용자가 보안 경고 없이 받을 수 있습니다.

배포용 Windows 앱 빌드:

```bash
npm run build:win
```

Windows 사용자는 같은 다운로드 페이지에 접속하면 됩니다. 최신 GitHub Release에 `.exe` 또는 Windows용 `.zip` 파일이 올라와 있으면 페이지가 Windows용 파일을 우선 연결합니다. macOS에서 Windows 앱을 빌드하려면 추가 도구가 필요할 수 있으니, 가장 쉬운 방법은 Windows 노트북에서 위 명령으로 빌드한 뒤 `dist/`의 `.exe` 파일을 GitHub Release에 업로드하는 것입니다.
