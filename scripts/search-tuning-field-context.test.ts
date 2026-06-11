// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { filterSampleItemsToTextRetrievableFields } from '../src/core/search-tuning/query-generator';
import { readTuningFieldContext, textRetrievableFields } from '../src/core/search-tuning/inspect';

const appDataConfigResponse = {
  Result: {
    Config: {
      DataConfig: {
        IndexFields: ['title', 'description', 'cover_url'],
        FilterFields: ['category'],
        SuggestFields: ['title'],
        ImageIndexFields: ['cover_url'],
        FieldDescMap: {
          title: 'Item title',
          description: 'Long item description',
          cover_url: 'Image URL'
        }
      }
    }
  }
};

const fieldContext = readTuningFieldContext(appDataConfigResponse);

assert.deepEqual(fieldContext.indexFields, ['title', 'description', 'cover_url']);
assert.deepEqual(fieldContext.imageIndexFields, ['cover_url']);
assert.deepEqual(textRetrievableFields(fieldContext), ['title', 'description']);

assert.deepEqual(
  filterSampleItemsToTextRetrievableFields(
    [
      {
        item_id: 'item-1',
        title: 'Compact travel backpack',
        description: 'Waterproof bag for weekend trips',
        cover_url: 'https://example.com/bag.jpg',
        category: 'bags',
        price: 99
      }
    ],
    fieldContext
  ),
  [
    {
      item_id: 'item-1',
      title: 'Compact travel backpack',
      description: 'Waterproof bag for weekend trips'
    }
  ]
);

console.log('search tuning field context tests passed');
