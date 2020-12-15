import React from 'react';
import styled from 'styled-components';

import { openLink } from 'mainProcess';

import Prism from 'prismjs';

const Body = styled.div`
  * {
    font-size: 14px;
    font-weight: 400;
    line-height: 1.6em;
    color: #fff;
  }

  strong {
    font-weight: 600;
    font-size: 14px;
  }

  hr {
    border: none;
    height: 1px;
    background-color: #535557;
    height: 0;
  }

  code {
    padding: 2px 4px;

    color: #D9D9DA;
    font-family: 'Roboto Mono';
    font-size: 14px;
    font-weight: 400;

    background: #23222D;
    border-radius: 3px;
  }

  /* Code block */
  pre {
    padding: 10px;
    overflow-y: auto;

    background: #23222D;
    border-radius: 3px;

    code {
      padding: 0;
      background: transparent;
      line-height: 18px;
    }
  }

  h1 {
    font-size: 15px;
  }

  h2 {
    font-size: 14px;
    font-weight: 600;
  }

  h3 {
    font-size: 14px;
  }

  a {
    color: #4CACD6;
    text-decoration: underline;
  }

  img {
    max-width: 100%;
  }
`;


interface StackOverflowBodyProps {
  className?: string;
  html: string;
  tabIndex?: number;
}

const StackOverflowBody = React.forwardRef<HTMLDivElement, StackOverflowBodyProps>(({
  className,
  html,
  tabIndex,
}, ref) => {
  // Open all links in the browser.
  function handleBodyClick(e: any) {
    const target = e.target || e.srcElement;
    if (target.tagName === 'A') {
      const url = target.getAttribute('href');
      openLink(url);
      e.preventDefault();
    }

    if (target.tagName === 'IMG') {
      const url = target.getAttribute('src');
      openLink(url);
      e.preventDefault();
    }
  }

  function highlightCode(html: string) {
    const el = document.createElement('html');
    el.innerHTML = html;

    const codes = el.getElementsByTagName('code');
    for (const code of codes) {
      const codeText = code.childNodes[0].nodeValue;
      if (codeText) {
        const codeHTML = Prism.highlight(codeText, Prism.languages.clike, 'clike');
        code.innerHTML = codeHTML;
      }
    }
    return el.outerHTML;
  }

  return (
    <Body
      ref={ref}
      tabIndex={tabIndex}
      className={className}
      dangerouslySetInnerHTML={{__html: highlightCode(html) as string}}
      onClick={handleBodyClick}
    />
  );
});

export default StackOverflowBody;

