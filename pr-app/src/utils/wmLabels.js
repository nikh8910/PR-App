/**
 * Shared WM code label maps.
 * Usage: import { PROCESS_TYPE_LABELS, ACTIVITY_TYPE_LABELS, STOCK_TYPE_LABELS } from '../../utils/wmLabels';
 */

export const PROCESS_TYPE_LABELS = {
    'S012': 'Putaway (Distributive)',
    'S110': 'Putaway',
    'S201': 'Stock Removal for Prod.',
    'S210': 'Picking',
    'S230': 'Putaway',
    'S310': 'Replenishment',
    'S340': 'Packing',
    'S350': 'Move HU',
    'S400': 'Transfer Posting',
    'S401': 'Transfer (Prod. Supply)',
    'S410': 'Post to Unrestricted',
    'S420': 'Post to Scrap',
    'S425': 'Scrap/Sample',
    'S430': 'Posting Change in Bin',
    'S996': 'Kanban Reversal',
    'S997': 'Putaway (Clarification)',
    'S999': 'WH Supervision',
    'S201': 'Goods Receipt',
    'S202': 'Goods Issue',
    'S220': 'Replenishment',
    'S012': 'Physical Inventory',
};

export const ACTIVITY_TYPE_LABELS = {
    'STCH': 'Stock Change/Transfer',
    'PUWA': 'Putaway',
    'PICK': 'Picking',
    'REPL': 'Replenishment',
    'PACK': 'Packing',
    'MOVE': 'HU Move',
    'COUN': 'PI Count',
    'KBAN': 'Kanban',
    'REVE': 'Reversal',
    'WASU': 'WH Supervision',
    'TRSP': 'Transport',
    'STCK': 'Stock Check',
    'GR': 'Goods Receipt',
    'GI': 'Goods Issue',
    'PUT': 'Putaway',
};

export const STOCK_TYPE_LABELS = {
    'F': 'Unrestricted Use',
    'S': 'Quality Inspection',
    'R': 'Blocked',
    'T': 'In Transit',
    'B': 'Returns',
    'Q': 'In Quality Inspection',
    'K': 'Consignment',
};
