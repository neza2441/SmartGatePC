<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Computer extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'manufacturer',
        'model',
        'serial_number',
        'status',
        'reviewed_by',
    ];

    protected static function booted(): void
    {
        static::creating(function (Computer $computer): void {
            $computer->id ??= (string) Str::uuid();
        });
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function qrCodeToken(): string
    {
        $signature = hash_hmac('sha256', $this->getKey(), (string) config('app.key'));

        return "SG1.{$this->getKey()}.{$signature}";
    }
}
