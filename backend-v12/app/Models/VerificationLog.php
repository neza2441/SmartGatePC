<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Model;

class VerificationLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'officer_id',
        'computer_id',
        'identifier',
        'result',
        'created_at',
    ];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    public function officer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'officer_id');
    }

    public function computer(): BelongsTo
    {
        return $this->belongsTo(Computer::class);
    }
}
