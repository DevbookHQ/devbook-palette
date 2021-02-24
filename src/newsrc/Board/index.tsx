import React, { useEffect } from 'react';
import styled from 'styled-components';
import { observer } from 'mobx-react-lite';

import * as Colors from 'newsrc/ui/colors';
import Tile from 'newsrc/Tile';
import { NumberSize, Resizable, ResizeCallback } from 're-resizable';

import { ExtensionID } from 'newsrc/extensions/extensionID';
import { useExtensionsStore } from 'newsrc/extensions/extensions.store';
import { useUserStore } from 'newsrc/user/user.store';

// TODO: CSS-wise, this should probably be a grid?
const Container = styled.div`
  width: 100%;
  height: 100%;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  // flex: 1;
  // display: flex;
  // flex-wrap: wrap;
  // overflow-y: auto;
  overflow: auto;
  background: ${Colors.Charcoal.dark};
`;

const TopTile = styled(Tile)`
  // margin: 8px;
  height: 100%;
  width: 100%;
  /*
  height: 495px;
  width: 685px;
  */

  /*
  height: 648px;
  width: 440px;
  */

  /*
  position: relative;
  left: 24px;
  top: 16px;
  */

  /*
  border-bottom: 1px solid purple;
  border-right: 1px solid green;
  */
`;

const BottomTile = styled(Tile)`
  height: 100%;
  width: 100%;
  /*
  height: 467px;
  width: 1464px;
  */
  /*
  border-bottom: 1px solid purple;
  border-right: 1px solid green;
  */
`;


const SplitHorizontal = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: flex-start;
  // Yellow
  //background: rgba(255, 0, 0, 0.2);
`;

const SplitVertical = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  // Green
  //background: rgba(0, 255, 0, 0.2);
`;

function Board() {
  const horizontalResizableRef = React.useRef<any>(null);
  const verticalResizableRef = React.useRef<any>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [soResults, setSOResults] = React.useState<any[]>([]);

  const extensionsStore = useExtensionsStore();

  // useEffect(() => {
  //   extensionsStore.enableExtension(ExtensionID.StackOverflow);
  //   // userStore.signIn('tomas@usedevbook.com');
  // }, [])

  const stackoverflowExtension = extensionsStore.getExtension(ExtensionID.StackOverflow);

  const searchStackOverflow = React.useCallback(async (query: string) => {
    if (stackoverflowExtension?.isReady) {
      return (await stackoverflowExtension.search({ query })).results as any[];
    }
    console.log('Extension is not ready');
    return [] as any;
  }, [stackoverflowExtension?.isReady]);

  React.useEffect(() => {
    async function search() {
      const r = await searchStackOverflow('golang append buffer');
      console.log('FOUND', r);
      setSOResults(r);
    }
    search();
  }, [searchStackOverflow]);

  React.useEffect(() => {
    console.log('Starting width', horizontalResizableRef?.current.resizable.offsetWidth);
    console.log('Starting height', horizontalResizableRef?.current.resizable.offsetHeight);
    for (let el of document.getElementsByClassName("vertical-resizable")) {
      (el as HTMLElement).style.height = '50%';
    }
  }, []);

  function handleResizeHorizontal(event: any, dir: any, ref: HTMLDivElement, delta: NumberSize) {
    console.log('ref', ref.offsetWidth);
  }

  return (
    <Container>
      <SplitVertical>

        <SplitHorizontal>
          <Resizable
            ref={horizontalResizableRef}
            defaultSize={{
              width: '50%',
              height: '100%',
            }}
            minHeight="64"
            minWidth="10%"
            enable={{ right: true }}
            onResizeStart={() => console.log('On Resize Start')}
            onResizeStop={() => console.log('On Resize Stop')}
            onResize={handleResizeHorizontal as ResizeCallback}
          >
            <TopTile
              isFocused
              results={soResults}
            />
          </Resizable>
          <TopTile
            results={soResults}
          />
        </SplitHorizontal>

        <SplitHorizontal>
          <Resizable
            ref={verticalResizableRef}
            className="vertical-resizable"
            defaultSize={{
              width: '50%',
              height: '100%',
            }}
            enable={{ top: true }}
            minHeight="10%"
          />
          <BottomTile
            results={soResults}
          />
        </SplitHorizontal>
      </SplitVertical>
    </Container>
  );
}

export default observer(Board);
