/*
 * Copyright 2023 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Link } from '@backstage/core-components';
import { RenderResult, render } from '@testing-library/react';
import { createSpecializedApp } from '@backstage/frontend-app-api';
import {
  ExtensionDefinition,
  IconComponent,
  RouteRef,
  coreExtensionData,
  createExtension,
  createExtensionInput,
  createExtensionOverrides,
  createNavItemExtension,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { MockConfigApi } from '@backstage/test-utils';
import { JsonArray, JsonObject, JsonValue } from '@backstage/types';
// eslint-disable-next-line @backstage/no-relative-monorepo-imports
import { resolveExtensionDefinition } from '../../../frontend-plugin-api/src/wiring/resolveExtensionDefinition';
// eslint-disable-next-line @backstage/no-relative-monorepo-imports
import { createSignInPageExtension } from '../../../frontend-plugin-api/src/extensions/createSignInPageExtension';
// eslint-disable-next-line @backstage/no-relative-monorepo-imports
import { InternalExtensionDefinition } from '../../../frontend-plugin-api/src/wiring/createExtension';

const TestCoreNavExtension = createExtension({
  namespace: 'core',
  name: 'nav',
  attachTo: { id: 'core/layout', input: 'nav' },
  inputs: {
    items: createExtensionInput({
      target: createNavItemExtension.targetDataRef,
    }),
  },
  output: {
    element: coreExtensionData.reactElement,
  },
  factory({ inputs }) {
    const NavItem = (props: {
      routeRef: RouteRef<undefined>;
      title: string;
      icon: IconComponent;
    }) => {
      const { routeRef, title, icon: Icon } = props;
      const to = useRouteRef(routeRef)();
      return (
        <li>
          <Link to={to}>
            <Icon />
            {title}
          </Link>
        </li>
      );
    };
    return {
      element: (
        <nav>
          {inputs.items.map((item, index) => (
            <NavItem
              key={index}
              icon={item.output.target.icon}
              title={item.output.target.title}
              routeRef={item.output.target.routeRef}
            />
          ))}
        </nav>
      ),
    };
  },
});

const TestCoreRouterExtension = createExtension({
  namespace: 'core',
  name: 'router',
  attachTo: { id: 'core', input: 'root' },
  inputs: {
    signInPage: createExtensionInput(
      {
        component: createSignInPageExtension.componentDataRef,
      },
      { singleton: true, optional: true },
    ),
    children: createExtensionInput(
      {
        element: coreExtensionData.reactElement,
      },
      { singleton: true },
    ),
  },
  output: {
    element: coreExtensionData.reactElement,
  },
  factory({ inputs }) {
    return {
      element: <MemoryRouter>{inputs.children.output.element}</MemoryRouter>,
    };
  },
});

/** @public */
export class ExtensionTester {
  /** @internal */
  static forSubject<TConfig>(
    subject: ExtensionDefinition<TConfig>,
    options?: { config?: TConfig },
  ): ExtensionTester {
    const tester = new ExtensionTester();
    const { output, factory, ...rest } =
      subject as InternalExtensionDefinition<TConfig>;
    // attaching to core/routes to render as index route
    const extension = createExtension({
      ...rest,
      attachTo: { id: 'core/routes', input: 'routes' },
      output: {
        ...output,
        path: coreExtensionData.routePath,
      },
      factory: params => ({
        ...factory(params),
        path: '/',
      }),
    });
    tester.add(extension, options);
    return tester;
  }

  readonly #extensions = new Array<{
    id: string;
    definition: ExtensionDefinition<any>;
    config?: JsonValue;
  }>();

  add<TConfig>(
    extension: ExtensionDefinition<TConfig>,
    options?: { config?: TConfig },
  ): ExtensionTester {
    const { name, namespace } = extension;

    const definition = {
      ...extension,
      // setting name "test" as fallback
      name: !namespace && !name ? 'test' : name,
    };

    const { id } = resolveExtensionDefinition(definition);

    this.#extensions.push({
      id,
      definition,
      config: options?.config as JsonValue,
    });

    return this;
  }

  render(options?: { config?: JsonObject }): RenderResult {
    const { config = {} } = options ?? {};

    const [subject, ...rest] = this.#extensions;
    if (!subject) {
      throw new Error(
        'No subject found. At least one extension should be added to the tester.',
      );
    }

    const extensionsConfig: JsonArray = [
      ...rest.map(extension => ({
        [extension.id]: {
          config: extension.config,
        },
      })),
      {
        [subject.id]: {
          config: subject.config,
          disabled: false,
        },
      },
    ];

    const finalConfig = {
      ...config,
      app: {
        ...(typeof config.app === 'object' ? config.app : undefined),
        extensions: extensionsConfig,
      },
    };

    const app = createSpecializedApp({
      features: [
        createExtensionOverrides({
          extensions: [
            ...this.#extensions.map(extension => extension.definition),
            TestCoreNavExtension,
            TestCoreRouterExtension,
          ],
        }),
      ],
      config: new MockConfigApi(finalConfig),
    });

    return render(app.createRoot());
  }
}

/** @public */
export function createExtensionTester<TConfig>(
  subject: ExtensionDefinition<TConfig>,
  options?: { config?: TConfig },
): ExtensionTester {
  return ExtensionTester.forSubject(subject, options);
}
