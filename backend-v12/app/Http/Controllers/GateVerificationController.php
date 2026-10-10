<?php

namespace App\Http\Controllers;

use App\Models\Computer;
use App\Models\VerificationLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class GateVerificationController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate(['identifier' => ['required', 'string', 'max:160']]);
        $identifier = trim($data['identifier']);
        $computer = $this->findComputer($identifier);
        $result = match ($computer?->status) {
            'verified' => 'verified',
            'pending_review' => 'pending_review',
            'rejected' => 'rejected',
            default => 'not_registered',
        };

        $log = VerificationLog::create([
            'officer_id' => $request->user()->id,
            'computer_id' => $computer?->id,
            'identifier' => Str::limit($identifier, 160, ''),
            'result' => $result,
        ]);

        return response()->json([
            'status' => $result,
            'message' => match ($result) {
                'verified' => 'Device verified.',
                'pending_review' => 'Device is registered but awaiting administrator review.',
                'rejected' => 'Device registration was rejected.',
                default => 'No registered device matches this identifier.',
            },
            'logId' => $log->id,
            'device' => $computer ? [
                'id' => $computer->id,
                'student' => $computer->owner()->value('name'),
                'brand' => $computer->manufacturer,
                'model' => $computer->model,
                'serial' => $computer->serial_number,
                'status' => $computer->status,
            ] : null,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $logs = VerificationLog::with(['computer', 'officer'])
            ->where('officer_id', $request->user()->id)
            ->latest('created_at')
            ->limit(200)
            ->get();

        return response()->json(['data' => $logs->map(fn (VerificationLog $log) => [
            'id' => $log->id,
            'student' => $log->computer?->owner()->value('name') ?? 'Unknown device',
            'device' => $log->computer ? "{$log->computer->manufacturer} {$log->computer->model}" : 'Unregistered PC',
            'serial' => $log->computer?->serial_number ?? $log->identifier,
            'officer' => $log->officer?->name,
            'time' => $log->created_at?->format('h:i A'),
            'checkedAt' => $log->created_at?->toISOString(),
            'result' => $this->label($log->result),
        ])]);
    }

    public function studentIndex(Request $request): JsonResponse
    {
        $logs = VerificationLog::with(['computer.owner', 'officer'])
            ->whereHas('computer', fn ($query) => $query->where('user_id', $request->user()->id))
            ->latest('created_at')
            ->limit(200)
            ->get();

        return response()->json(['data' => $logs->map(fn (VerificationLog $log) => [
            'id' => $log->id,
            'student' => $log->computer?->owner?->name,
            'device' => "{$log->computer?->manufacturer} {$log->computer?->model}",
            'serial' => $log->computer?->serial_number,
            'officer' => $log->officer?->name,
            'time' => $log->created_at?->format('h:i A'),
            'checkedAt' => $log->created_at?->toISOString(),
            'result' => $this->label($log->result),
        ])]);
    }

    private function findComputer(string $identifier): ?Computer
    {
        $parts = explode('.', $identifier);

        if (count($parts) === 3 && $parts[0] === 'SG1' && Str::isUuid($parts[1])) {
            $expected = hash_hmac('sha256', $parts[1], (string) config('app.key'));
            if (! hash_equals($expected, $parts[2])) {
                return null;
            }

            return Computer::with('owner')->find($parts[1]);
        }

        return Computer::with('owner')->where('serial_number', Str::upper($identifier))->first();
    }

    private function label(string $result): string
    {
        return match ($result) {
            'verified' => 'Verified',
            'pending_review' => 'Pending review',
            'rejected' => 'Rejected',
            default => 'Not registered',
        };
    }
}