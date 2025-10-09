"""add_invoices_table

Revision ID: 05c00e13a615
Revises: 80a1b6c7d8a9
Create Date: 2025-08-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '05c00e13a615'
down_revision: Union[str, None] = '80a1b6c7d8a9'
branch_labels: Union[str, Sequence[str], None] = None
# Ensure quotes_v2 exists before creating invoices with FK to quotes_v2
depends_on: Union[str, Sequence[str], None] = ('b0a1c2d3e4f5',)


def upgrade() -> None:
    op.create_table(
        'invoices',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('quote_id', sa.Integer(), sa.ForeignKey('quotes_v2.id'), nullable=False),
        sa.Column('booking_id', sa.Integer(), sa.ForeignKey('bookings_simple.id'), nullable=False),
        sa.Column('artist_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('issue_date', sa.Date(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('amount_due', sa.Numeric(10, 2), nullable=False),
        sa.Column('status', sa.Enum('unpaid', 'partial', 'paid', 'overdue', name='invoicestatus'), nullable=False, server_default='unpaid'),
        sa.Column('payment_method', sa.String(), nullable=True),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('pdf_url', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('invoices')
    op.execute("DROP TYPE IF EXISTS invoicestatus")
